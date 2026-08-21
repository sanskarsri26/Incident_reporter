/**
 * Seeds the configured repository (Supabase if SUPABASE_URL /
 * SUPABASE_SERVICE_ROLE_KEY are set, otherwise an in-memory repository --
 * note that the in-memory repository used by a running `next dev`/`next
 * start` server auto-seeds itself on first access via
 * lib/db/auto-seed.ts, so this script mainly matters for seeding a real
 * Supabase database) with the service topology, every generated incident
 * (with its log/metric events), and every runbook/service-description doc
 * (embedded via getEmbeddingProvider() -- real Gemini embeddings if
 * GEMINI_API_KEY is set, otherwise the mock provider).
 *
 * Run with: npm run seed
 */
import { getRepository } from "@/lib/db/index";
import { seedServiceTopology, seedIncidentDataset, seedRunbookDocuments } from "@/lib/db/auto-seed";

async function seedServices() {
  return seedServiceTopology(getRepository());
}

async function seedIncidents() {
  return seedIncidentDataset(getRepository());
}

async function seedRunbooks() {
  return seedRunbookDocuments(getRepository());
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
