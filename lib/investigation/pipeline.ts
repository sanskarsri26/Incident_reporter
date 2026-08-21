import { buildIncidentSummary } from "@/lib/investigation/summary";
import { buildEvidenceCatalog } from "@/lib/investigation/evidence-catalog";
import { validateCandidateEvidence } from "@/lib/investigation/evidence-validation";
import { retrieveHybrid } from "@/lib/retrieval/document-retrieval";
import { findSimilarIncidents } from "@/lib/retrieval/similar-incidents";
import { computeRankingScore } from "@/lib/scoring/ranking-score";
import type { EmbeddingProvider, EvidenceCatalogItem, LLMProvider } from "@/lib/gemini/types";
import type {
  AnalysisRun,
  DocumentRecord,
  Evidence,
  Incident,
  LogEvent,
  MetricEvent,
  Prediction,
  Recommendation,
} from "@/lib/types";

export interface RunInvestigationParams {
  incident: Incident;
  logEvents: LogEvent[];
  metricEvents: MetricEvent[];
  documents: DocumentRecord[];
  historicalIncidents: Array<{ incident: Incident; summary: string }>;
  llmProvider: LLMProvider;
  embeddingProvider: EmbeddingProvider;
  promptVersion?: string;
  maxCandidates?: number;
  topKDocuments?: number;
  topKSimilarIncidents?: number;
  /** Forwarded to the LLM provider's generateCandidates() -- see GenerateCandidatesInput. */
  validRootCauses?: string[];
}

export interface CandidateDiagnostics {
  rootCause: string;
  rankingScore: number;
  modelScore: number;
  supportingEvidenceIds: string[];
  contradictingEvidenceIds: string[];
  confirmedEvidenceIds: string[];
  unsupportedCitationCount: number;
}

export interface InvestigationResult {
  analysisRun: AnalysisRun;
  predictions: Prediction[];
  evidence: Evidence[];
  recommendations: Recommendation[];
  evidenceCatalog: EvidenceCatalogItem[];
  candidateDiagnostics: CandidateDiagnostics[];
  requestCount: number;
}

const EVIDENCE_COVERAGE_TARGET = 3;

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export async function runInvestigation(params: RunInvestigationParams): Promise<InvestigationResult> {
  const {
    incident,
    logEvents,
    metricEvents,
    documents,
    historicalIncidents,
    llmProvider,
    embeddingProvider,
    promptVersion = "v1",
    maxCandidates = 3,
    topKDocuments = 5,
    topKSimilarIncidents = 3,
    validRootCauses,
  } = params;

  const startedAt = Date.now();
  let requestCount = 0;

  const summary = buildIncidentSummary(incident, logEvents, metricEvents);

  const retrievedDocuments = await retrieveHybrid(summary, documents, embeddingProvider, topKDocuments);
  requestCount += 1;

  const similarIncidents = await findSimilarIncidents(
    summary,
    incident.id,
    historicalIncidents,
    embeddingProvider,
    topKSimilarIncidents,
  );
  requestCount += 1;

  const evidenceCatalog = buildEvidenceCatalog(logEvents, metricEvents, retrievedDocuments, similarIncidents);

  const { candidates } = await llmProvider.generateCandidates({
    incidentSummary: summary,
    evidenceCatalog,
    maxCandidates,
    validRootCauses,
  });
  requestCount += 1;

  const catalogById = new Map(evidenceCatalog.map((item) => [item.id, item]));
  const candidateDiagnostics: CandidateDiagnostics[] = [];

  for (const rawCandidate of candidates) {
    const validated = validateCandidateEvidence(rawCandidate, evidenceCatalog);

    const { confirmedEvidenceIds: rawConfirmedEvidenceIds } = await llmProvider.verifyCandidate({
      incidentSummary: summary,
      candidate: { ...rawCandidate, supportingEvidenceIds: validated.supportingEvidenceIds },
      evidenceCatalog,
    });
    requestCount += 1;

    // A verifier can only legitimately *confirm* an ID that was actually
    // cited by the candidate -- it has no basis to introduce a new
    // citation of its own. Without this, a hallucinating or buggy verifier
    // could return IDs that don't exist in the catalog at all, or more IDs
    // than were originally cited, inflating verifierSupport above what it
    // should be (only clamped, not corrected, by clamp01 downstream). This
    // is the same evidence-validation guarantee the initial candidate
    // citations get, applied to the independent verification step too.
    const confirmedEvidenceIds = rawConfirmedEvidenceIds.filter((id) => validated.supportingEvidenceIds.includes(id));

    const citedSimilarities = validated.supportingEvidenceIds
      .map((id) => catalogById.get(id)?.similarity)
      .filter((value): value is number => typeof value === "number");
    const retrievalSimilarity =
      citedSimilarities.length > 0
        ? average(citedSimilarities)
        : average(retrievedDocuments.map((d) => d.combinedScore));

    const citedIncidentSimilarities = validated.supportingEvidenceIds
      .map((id) => catalogById.get(id))
      .filter((item): item is EvidenceCatalogItem => item?.sourceType === "incident")
      .map((item) => item.similarity ?? 0);
    const historicalMatch =
      citedIncidentSimilarities.length > 0
        ? Math.max(...citedIncidentSimilarities)
        : (similarIncidents[0]?.similarity ?? 0) * 0.5;

    const verifierSupport =
      validated.supportingEvidenceIds.length > 0
        ? confirmedEvidenceIds.length / validated.supportingEvidenceIds.length
        : 0;

    const rankingScore = computeRankingScore({
      evidenceCoverage: Math.min(1, validated.supportingEvidenceIds.length / EVIDENCE_COVERAGE_TARGET),
      retrievalSimilarity,
      historicalMatch,
      verifierSupport,
      contradictionCount: validated.contradictingEvidenceIds.length,
    });

    candidateDiagnostics.push({
      rootCause: rawCandidate.rootCause,
      rankingScore,
      modelScore: rawCandidate.score,
      supportingEvidenceIds: validated.supportingEvidenceIds,
      contradictingEvidenceIds: validated.contradictingEvidenceIds,
      confirmedEvidenceIds,
      unsupportedCitationCount: validated.unsupportedCitationCount,
    });
  }

  // Deterministic tiebreak: rankingScore ties are common (evidenceCoverage
  // saturates at EVIDENCE_COVERAGE_TARGET and historicalMatch/
  // retrievalSimilarity are often near-constant across candidates for the
  // same incident), so relying on Array.prototype.sort's stability alone
  // would make the winning candidate depend on the LLM's emission order
  // rather than on anything measured. Break ties by modelScore (the LLM's
  // own confidence), then by rootCause alphabetically as a final,
  // fully-deterministic fallback.
  candidateDiagnostics.sort((a, b) => {
    if (b.rankingScore !== a.rankingScore) return b.rankingScore - a.rankingScore;
    if (b.modelScore !== a.modelScore) return b.modelScore - a.modelScore;
    return a.rootCause.localeCompare(b.rootCause);
  });

  const finalRootCause = candidateDiagnostics[0]?.rootCause ?? "unknown";

  const { actions } = await llmProvider.generateActions({
    incidentSummary: summary,
    finalRootCause,
    evidenceCatalog,
  });
  requestCount += 1;

  const analysisRun: AnalysisRun = {
    id: globalThis.crypto.randomUUID(),
    incidentId: incident.id,
    model: llmProvider.name,
    promptVersion,
    latencyMs: Date.now() - startedAt,
    status: "succeeded",
    createdAt: new Date().toISOString(),
  };

  const predictions: Prediction[] = candidateDiagnostics.map((diagnostic, index) => ({
    id: globalThis.crypto.randomUUID(),
    analysisRunId: analysisRun.id,
    rootCause: diagnostic.rootCause,
    rank: index + 1,
    confidence: diagnostic.rankingScore,
  }));

  const evidence: Evidence[] = predictions.flatMap((prediction, index) => {
    const diagnostic = candidateDiagnostics[index];
    if (!diagnostic) return [];
    const supporting = diagnostic.supportingEvidenceIds.map((catalogId): Evidence | null => {
      const item = catalogById.get(catalogId);
      if (!item) return null;
      return {
        id: globalThis.crypto.randomUUID(),
        predictionId: prediction.id,
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        supportType: "supporting",
      };
    });
    const contradicting = diagnostic.contradictingEvidenceIds.map((catalogId): Evidence | null => {
      const item = catalogById.get(catalogId);
      if (!item) return null;
      return {
        id: globalThis.crypto.randomUUID(),
        predictionId: prediction.id,
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        supportType: "contradicting",
      };
    });
    return [...supporting, ...contradicting].filter((e): e is Evidence => e !== null);
  });

  const recommendations: Recommendation[] = actions.map((action, index) => ({
    id: globalThis.crypto.randomUUID(),
    analysisRunId: analysisRun.id,
    action,
    priority: index + 1,
  }));

  return { analysisRun, predictions, evidence, recommendations, evidenceCatalog, candidateDiagnostics, requestCount };
}
