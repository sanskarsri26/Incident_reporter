/**
 * Runs the investigation pipeline against a held-out test split of the
 * generated incident dataset and writes a measured evaluation report to
 * data/evaluation-report.json. Uses getLLMProvider()/getEmbeddingProvider()
 * (mock unless GEMINI_API_KEY is set), so this never calls a paid API
 * unless the caller has explicitly configured one.
 *
 * Run with: npm run evaluate
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getEmbeddingProvider, getLLMProvider } from "@/lib/gemini/index";
import { runInvestigation } from "@/lib/investigation/pipeline";
import { retrieveByVectorOnly, retrieveHybrid } from "@/lib/retrieval/document-retrieval";
import { buildIncidentSummary } from "@/lib/investigation/summary";
import { buildHistoricalSummary } from "@/lib/investigation/historical-summary";
import { computeEvaluationSummary, type EvaluationCase, type EvaluationSummary } from "@/lib/evaluation/metrics";
import { createStratifiedSplit } from "@/lib/evaluation/split";
import type { DocType, DocumentRecord, Incident, LogEvent, MetricEvent } from "@/lib/types";

const MANIFESTS_DIR = path.resolve(import.meta.dirname, "..", "data", "incident-manifests");
const RUNBOOKS_DIR = path.resolve(import.meta.dirname, "..", "data", "runbooks");
const REPORT_PATH = path.resolve(import.meta.dirname, "..", "data", "evaluation-report.json");

interface ManifestFile {
  incident: Incident;
  manifest: { expectedEvidence: string[] };
  logEvents: LogEvent[];
  metricEvents: MetricEvent[];
}

function docTypeForFilename(filename: string): DocType {
  return filename.startsWith("service-") ? "service_description" : "runbook";
}

function loadManifests(): ManifestFile[] {
  const files = readdirSync(MANIFESTS_DIR).filter((f) => f.endsWith(".json") && f !== "index.json");
  return files.map((file) => JSON.parse(readFileSync(path.join(MANIFESTS_DIR, file), "utf-8")) as ManifestFile);
}

async function loadEmbeddedDocuments(): Promise<DocumentRecord[]> {
  const files = readdirSync(RUNBOOKS_DIR).filter((f) => f.endsWith(".md"));
  const raw = files.map((file) => {
    const body = readFileSync(path.join(RUNBOOKS_DIR, file), "utf-8");
    const heading = body.split("\n").find((line) => line.startsWith("# "));
    return {
      id: file.replace(/\.md$/, ""),
      title: heading ? heading.replace(/^#\s+/, "").trim() : file,
      body,
      docType: docTypeForFilename(file),
    };
  });

  const embeddingProvider = getEmbeddingProvider();
  const vectors = await embeddingProvider.embed(raw.map((d) => `${d.title} ${d.body}`));
  return raw.map((d, i) => ({ ...d, embedding: vectors[i] ?? null }));
}

async function runCase(
  manifest: ManifestFile,
  documents: DocumentRecord[],
  historicalIncidents: Array<{ incident: Incident; summary: string }>,
): Promise<EvaluationCase> {
  try {
    const result = await runInvestigation({
      incident: manifest.incident,
      logEvents: manifest.logEvents,
      metricEvents: manifest.metricEvents,
      documents,
      historicalIncidents,
      llmProvider: getLLMProvider(),
      embeddingProvider: getEmbeddingProvider(),
    });

    const top = result.candidateDiagnostics[0];

    return {
      incidentId: manifest.incident.id,
      faultTruth: manifest.incident.rootCauseTruth,
      predictedRootCauses: result.predictions.map((p) => p.rootCause),
      expectedEvidenceTags: manifest.manifest.expectedEvidence,
      evidenceCatalogSummaries: result.evidenceCatalog.map((e) => e.summary),
      citedEvidenceCount: (top?.supportingEvidenceIds.length ?? 0) + (top?.contradictingEvidenceIds.length ?? 0),
      unsupportedCitationCount: top?.unsupportedCitationCount ?? 0,
      latencyMs: result.analysisRun.latencyMs,
      requestCount: result.requestCount,
      failed: false,
    };
  } catch {
    return {
      incidentId: manifest.incident.id,
      faultTruth: manifest.incident.rootCauseTruth,
      predictedRootCauses: [],
      expectedEvidenceTags: manifest.manifest.expectedEvidence,
      evidenceCatalogSummaries: [],
      citedEvidenceCount: 0,
      unsupportedCitationCount: 0,
      latencyMs: 0,
      requestCount: 0,
      failed: true,
    };
  }
}

async function runAblationC(testManifests: ManifestFile[], documents: DocumentRecord[], allByOther: (id: string) => Array<{ incident: Incident; summary: string }>) {
  let rankingScoreCorrect = 0;
  let modelScoreCorrect = 0;

  for (const manifest of testManifests) {
    const result = await runInvestigation({
      incident: manifest.incident,
      logEvents: manifest.logEvents,
      metricEvents: manifest.metricEvents,
      documents,
      historicalIncidents: allByOther(manifest.incident.id),
      llmProvider: getLLMProvider(),
      embeddingProvider: getEmbeddingProvider(),
    });

    const byRankingScore = [...result.candidateDiagnostics].sort((a, b) => b.rankingScore - a.rankingScore)[0];
    const byModelScore = [...result.candidateDiagnostics].sort((a, b) => b.modelScore - a.modelScore)[0];

    if (byRankingScore?.rootCause === manifest.incident.rootCauseTruth) rankingScoreCorrect += 1;
    if (byModelScore?.rootCause === manifest.incident.rootCauseTruth) modelScoreCorrect += 1;
  }

  const n = testManifests.length || 1;
  return {
    rankingScoreTop1Accuracy: rankingScoreCorrect / n,
    modelScoreTop1Accuracy: modelScoreCorrect / n,
  };
}

async function runAblationD(testManifests: ManifestFile[], documents: DocumentRecord[]) {
  const embeddingProvider = getEmbeddingProvider();
  let vectorOnlyCorrect = 0;
  let hybridCorrect = 0;

  for (const manifest of testManifests) {
    const summary = buildIncidentSummary(manifest.incident, manifest.logEvents, manifest.metricEvents);
    const expectedDocId = manifest.incident.rootCauseTruth;

    const [vectorOnlyTop] = await retrieveByVectorOnly(summary, documents, embeddingProvider, 1);
    const [hybridTop] = await retrieveHybrid(summary, documents, embeddingProvider, 1);

    if (vectorOnlyTop?.document.id === expectedDocId) vectorOnlyCorrect += 1;
    if (hybridTop?.document.id === expectedDocId) hybridCorrect += 1;
  }

  const n = testManifests.length || 1;
  return {
    vectorOnlyTop1RunbookMatchRate: vectorOnlyCorrect / n,
    hybridTop1RunbookMatchRate: hybridCorrect / n,
  };
}

async function main() {
  const manifests = loadManifests();
  const documents = await loadEmbeddedDocuments();

  const split = createStratifiedSplit(manifests.map((m) => ({ id: m.incident.id, fault: m.incident.rootCauseTruth })));
  const splitByIncidentId = new Map(split.map((s) => [s.incidentId, s.split]));

  const testManifests = manifests.filter((m) => splitByIncidentId.get(m.incident.id) === "test");

  const allIncidentSummaries = (excludeId: string) =>
    manifests
      .filter((m) => m.incident.id !== excludeId)
      .map((m) => ({ incident: m.incident, summary: buildHistoricalSummary(m.incident) }));

  // The full-configuration run (documents + history) doubles as the
  // primary result and as the "with retrieval" / "with history" arm of
  // ablations A and B, so it only needs to be computed once per incident.
  const primaryCases: EvaluationCase[] = [];
  const withoutRetrievalCases: EvaluationCase[] = [];
  const withoutHistoryCases: EvaluationCase[] = [];

  for (const manifest of testManifests) {
    const history = allIncidentSummaries(manifest.incident.id);

    primaryCases.push(await runCase(manifest, documents, history));
    withoutRetrievalCases.push(await runCase(manifest, [], history));
    withoutHistoryCases.push(await runCase(manifest, documents, []));
  }

  const ablationC = await runAblationC(testManifests, documents, allIncidentSummaries);
  const ablationD = await runAblationD(testManifests, documents);

  const splitCounts = { dev: 0, validation: 0, test: 0 };
  for (const s of split) splitCounts[s.split] += 1;

  const report = {
    generatedAt: new Date().toISOString(),
    model: getLLMProvider().name,
    embeddingModel: getEmbeddingProvider().name,
    datasetSize: manifests.length,
    splitCounts,
    primary: computeEvaluationSummary(primaryCases),
    ablations: {
      a_retrieval_vs_no_retrieval: {
        withRetrieval: computeEvaluationSummary(primaryCases),
        withoutRetrieval: computeEvaluationSummary(withoutRetrievalCases),
      },
      b_history_vs_no_history: {
        withHistory: computeEvaluationSummary(primaryCases),
        withoutHistory: computeEvaluationSummary(withoutHistoryCases),
      },
      c_ranking_score_vs_model_score: ablationC,
      d_vector_only_vs_hybrid_retrieval: ablationD,
    },
    notes: [
      "Generated with the default mock LLM/embedding providers (no GEMINI_API_KEY set); this is a baseline for the pipeline's mechanics, not a claim about Gemini's diagnostic quality.",
      "The mock LLM matches candidate faults by keyword co-occurrence in evidence text, without judging whether a metric's *value* is anomalous. Baseline (non-fault) traffic padding shares metric names like cpu_percent across services, so it can produce plausible-looking false-positive candidates and depress top-1 accuracy relative to a real language model that reasons about magnitudes and trends. Re-running with a real GEMINI_API_KEY is expected to score meaningfully higher.",
      "evidenceRecallAt5 is computed against the full evidence catalog per case, not only the top 5 retrieved documents, since log/metric evidence is attached directly rather than retrieved by similarity.",
      "Ablation C compares ranking by the ranking-score heuristic (evidence coverage + retrieval + history + verifier agreement) against ranking by the model's raw self-reported score.",
    ],
  };

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n");

  console.log(`Evaluation report written to ${REPORT_PATH}`);
  console.log(`  dataset size: ${report.datasetSize} (test split: ${testManifests.length})`);
  console.log(`  top1 accuracy: ${(report.primary.top1Accuracy * 100).toFixed(1)}%`);
  console.log(`  top3 accuracy: ${(report.primary.top3Accuracy * 100).toFixed(1)}%`);
  console.log(`  evidence recall@5: ${(report.primary.evidenceRecallAt5 * 100).toFixed(1)}%`);
  console.log(`  unsupported evidence rate: ${(report.primary.unsupportedEvidenceRate * 100).toFixed(1)}%`);
  console.log(`  latency p50/p95 ms: ${report.primary.latencyP50Ms}/${report.primary.latencyP95Ms}`);
}

if (process.argv[1] === import.meta.filename) {
  main().catch((error: unknown) => {
    console.error("Evaluation failed:", error);
    process.exitCode = 1;
  });
}

export { loadManifests, loadEmbeddedDocuments };
