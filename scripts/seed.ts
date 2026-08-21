/**
 * Seeds the configured repository (Supabase if SUPABASE_URL /
 * SUPABASE_SERVICE_ROLE_KEY are set, otherwise an in-memory repository
 * that is a no-op across process boundaries) with:
 *   - the service topology (services + dependencies)
 *   - every generated incident under data/incident-manifests/*.json,
 *     including its log and metric events
 *   - every runbook / service-description doc under data/runbooks/*.md
 *     as a DocumentRecord, embedded via getEmbeddingProvider() (real
 *     Gemini embeddings if GEMINI_API_KEY is set, otherwise the mock
 *     provider) -- retrieval filters out documents with a null
 *     embedding, so this step is required for RAG to find anything.
 *
 * Run with: npm run seed
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { getRepository } from "@/lib/db/index";
import { getEmbeddingProvider } from "@/lib/gemini/index";
import { loadRunbookFiles } from "@/lib/documents/load-runbook-files";
import type { DocumentRecord, Incident, LogEvent, MetricEvent } from "@/lib/types";
import { SERVICES, SERVICE_DEPENDENCIES } from "@/simulator/services/graph";

const MANIFESTS_DIR = path.resolve(import.meta.dirname, "..", "data", "incident-manifests");

interface IncidentManifestFile {
  incident: Incident;
  logEvents: LogEvent[];
  metricEvents: MetricEvent[];
}

async function seedServices(): Promise<{ services: number; dependencies: number }> {
  const repository = getRepository();
  for (const service of SERVICES) {
    await repository.upsertService(service);
  }
  for (const dependency of SERVICE_DEPENDENCIES) {
    await repository.upsertServiceDependency(dependency);
  }
  return { services: SERVICES.length, dependencies: SERVICE_DEPENDENCIES.length };
}

async function seedIncidents(): Promise<{ incidents: number; logEvents: number; metricEvents: number }> {
  const repository = getRepository();
  let files: string[] = [];
  try {
    files = readdirSync(MANIFESTS_DIR).filter((f) => f.endsWith(".json") && f !== "index.json");
  } catch {
    return { incidents: 0, logEvents: 0, metricEvents: 0 };
  }

  let incidentCount = 0;
  let logEventCount = 0;
  let metricEventCount = 0;

  for (const file of files) {
    const raw = readFileSync(path.join(MANIFESTS_DIR, file), "utf-8");
    const data = JSON.parse(raw) as IncidentManifestFile;

    await repository.upsertIncident(data.incident);
    incidentCount += 1;

    if (data.logEvents.length > 0) {
      await repository.insertLogEvents(data.logEvents);
      logEventCount += data.logEvents.length;
    }
    if (data.metricEvents.length > 0) {
      await repository.insertMetricEvents(data.metricEvents);
      metricEventCount += data.metricEvents.length;
    }
  }

  return { incidents: incidentCount, logEvents: logEventCount, metricEvents: metricEventCount };
}

async function seedRunbooks(): Promise<{ runbooks: number; serviceDescriptions: number }> {
  const repository = getRepository();
  const files = loadRunbookFiles();
  if (files.length === 0) {
    return { runbooks: 0, serviceDescriptions: 0 };
  }

  const embeddingProvider = getEmbeddingProvider();
  const vectors = await embeddingProvider.embed(files.map((f) => `${f.title} ${f.body}`));

  let runbookCount = 0;
  let serviceDescriptionCount = 0;

  for (const [i, file] of files.entries()) {
    const document: DocumentRecord = {
      id: file.id,
      title: file.title,
      body: file.body,
      docType: file.docType,
      embedding: vectors[i] ?? null,
    };
    await repository.upsertDocument(document);

    if (file.docType === "runbook") runbookCount += 1;
    else serviceDescriptionCount += 1;
  }

  return { runbooks: runbookCount, serviceDescriptions: serviceDescriptionCount };
}

async function main() {
  const serviceSummary = await seedServices();
  const incidentSummary = await seedIncidents();
  const docSummary = await seedRunbooks();

  console.log("Seed complete.");
  console.log(`  services:            ${serviceSummary.services}`);
  console.log(`  service dependencies: ${serviceSummary.dependencies}`);
  console.log(`  incidents:           ${incidentSummary.incidents}`);
  console.log(`  log events:          ${incidentSummary.logEvents}`);
  console.log(`  metric events:       ${incidentSummary.metricEvents}`);
  console.log(`  runbooks:            ${docSummary.runbooks}`);
  console.log(`  service descriptions: ${docSummary.serviceDescriptions}`);

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log(
      "Note: SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are not set, so this ran against an in-memory repository " +
        "that does not persist across processes. Set those env vars to seed a real Supabase database.",
    );
  }
}

if (process.argv[1] === import.meta.filename) {
  main().catch((error: unknown) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  });
}

export { seedServices, seedIncidents, seedRunbooks };
