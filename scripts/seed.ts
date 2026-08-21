/**
 * Seeds the configured repository (Supabase if SUPABASE_URL /
 * SUPABASE_SERVICE_ROLE_KEY are set, otherwise an in-memory repository
 * that is a no-op across process boundaries) with:
 *   - the service topology (services + dependencies)
 *   - every generated incident under data/incident-manifests/*.json,
 *     including its log and metric events
 *   - every runbook / service-description doc under data/runbooks/*.md
 *     as a DocumentRecord (embedding generation is a separate later task)
 *
 * Run with: npm run seed
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { getRepository } from "@/lib/db/index";
import type { DocType, DocumentRecord, Incident, LogEvent, MetricEvent } from "@/lib/types";
import { SERVICES, SERVICE_DEPENDENCIES } from "@/simulator/services/graph";

const MANIFESTS_DIR = path.resolve(import.meta.dirname, "..", "data", "incident-manifests");
const RUNBOOKS_DIR = path.resolve(import.meta.dirname, "..", "data", "runbooks");

interface IncidentManifestFile {
  incident: Incident;
  logEvents: LogEvent[];
  metricEvents: MetricEvent[];
}

function titleFromMarkdown(body: string, fallback: string): string {
  const heading = body.split("\n").find((line) => line.startsWith("# "));
  return heading ? heading.replace(/^#\s+/, "").trim() : fallback;
}

function docTypeForFilename(filename: string): DocType {
  return filename.startsWith("service-") ? "service_description" : "runbook";
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
  let files: string[] = [];
  try {
    files = readdirSync(RUNBOOKS_DIR).filter((f) => f.endsWith(".md"));
  } catch {
    return { runbooks: 0, serviceDescriptions: 0 };
  }

  let runbookCount = 0;
  let serviceDescriptionCount = 0;

  for (const file of files) {
    const body = readFileSync(path.join(RUNBOOKS_DIR, file), "utf-8");
    const id = file.replace(/\.md$/, "");
    const docType = docTypeForFilename(file);

    const document: DocumentRecord = {
      id,
      title: titleFromMarkdown(body, id),
      body,
      docType,
      embedding: null,
    };
    await repository.upsertDocument(document);

    if (docType === "runbook") runbookCount += 1;
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
