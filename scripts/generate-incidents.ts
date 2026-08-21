/**
 * Generates the labeled ground-truth incident dataset from the fault
 * injectors + baseline traffic generator. For each fault type, produces
 * several incidents with varied (but deterministic) start times and
 * durations, merges fault events with baseline traffic, and writes one
 * JSON file per incident under data/incident-manifests/, plus an
 * index.json summarizing the whole set.
 *
 * Run with: npx tsx scripts/generate-incidents.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Incident, LogEvent, MetricEvent, Severity } from "@/lib/types";
import type { GroundTruthManifest } from "@/simulator/types";
import { FAULT_REGISTRY, FAULT_SLUGS } from "@/simulator/fault-injection/index";
import { generateBaselineTraffic } from "@/simulator/traffic/generator";
import { seededRng } from "@/simulator/random";

const INCIDENTS_PER_FAULT = 7;
const OUTPUT_DIR = path.resolve(import.meta.dirname, "..", "data", "incident-manifests");
const BASE_DATE = new Date("2026-01-15T00:00:00.000Z");

const FAULT_TITLES: Record<string, string> = {
  db_connection_pool_exhaustion: "Database connection pool exhaustion",
  db_slow_query: "Slow database query degrading checkout latency",
  memory_leak: "Memory leak in payment-service",
  dependency_timeout: "Payment-service dependency timeout",
  cpu_spike: "CPU saturation on inventory-service",
  redis_unavailable: "Redis cache unavailable",
  worker_backlog: "Payment worker queue backlog",
  bad_config_deploy: "Bad configuration deploy to checkout-service",
};

const FAULT_SEVERITIES: Record<string, Severity> = {
  db_connection_pool_exhaustion: "sev1",
  bad_config_deploy: "sev1",
  memory_leak: "sev2",
  dependency_timeout: "sev2",
  redis_unavailable: "sev2",
  cpu_spike: "sev3",
  db_slow_query: "sev3",
  worker_backlog: "sev4",
};

function zeroPad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

function maxTimestamp(events: Array<{ timestamp: string }>): string {
  return events.reduce((max, e) => (e.timestamp > max ? e.timestamp : max), events[0]?.timestamp ?? "");
}

interface GeneratedIncident {
  incident: Incident;
  manifest: GroundTruthManifest;
  logEvents: LogEvent[];
  metricEvents: MetricEvent[];
}

export function generateOneIncident(fault: string, incidentId: string): GeneratedIncident {
  const inject = FAULT_REGISTRY[fault];
  if (!inject) throw new Error(`No injector registered for fault "${fault}"`);

  const scheduleRng = seededRng(incidentId, "schedule");
  const dayOffset = Math.floor(scheduleRng() * 200);
  const hourOffset = Math.floor(scheduleRng() * 24);
  const minuteOffset = Math.floor(scheduleRng() * 60);
  const startedAt = new Date(
    BASE_DATE.getTime() + dayOffset * 86_400_000 + hourOffset * 3_600_000 + minuteOffset * 60_000,
  );

  const durationMinutes = 12 + Math.floor(scheduleRng() * 9); // 12-20 minutes of active fault signal
  const baseline = generateBaselineTraffic(incidentId, startedAt, durationMinutes + 5);
  const faultResult = inject(incidentId, startedAt);

  const logEvents = [...baseline.logEvents, ...faultResult.logEvents].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );
  const metricEvents = [...baseline.metricEvents, ...faultResult.metricEvents].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );

  const lastEventTimestamp = maxTimestamp([...logEvents, ...metricEvents]);
  const resolutionDelayMinutes = 5 + Math.floor(scheduleRng() * 40);
  const resolvedAt = new Date(new Date(lastEventTimestamp).getTime() + resolutionDelayMinutes * 60_000);

  const incident: Incident = {
    id: incidentId,
    title: FAULT_TITLES[fault] ?? fault,
    severity: FAULT_SEVERITIES[fault] ?? "sev3",
    status: "resolved",
    startedAt: startedAt.toISOString(),
    resolvedAt: resolvedAt.toISOString(),
    rootCauseTruth: fault,
    affectedServices: faultResult.manifest.affectedServices,
  };

  return { incident, manifest: faultResult.manifest, logEvents, metricEvents };
}

function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const indexEntries: Array<{ id: string; fault: string; severity: Severity }> = [];
  let counter = 0;

  for (const fault of FAULT_SLUGS) {
    for (let i = 0; i < INCIDENTS_PER_FAULT; i++) {
      counter += 1;
      const incidentId = `INC-${zeroPad(counter, 4)}`;
      const generated = generateOneIncident(fault, incidentId);

      const filePath = path.join(OUTPUT_DIR, `${incidentId}.json`);
      writeFileSync(filePath, JSON.stringify(generated, null, 2) + "\n", "utf-8");

      indexEntries.push({ id: incidentId, fault, severity: generated.incident.severity });
    }
  }

  const indexPath = path.join(OUTPUT_DIR, "index.json");
  writeFileSync(indexPath, JSON.stringify(indexEntries, null, 2) + "\n", "utf-8");

  console.log(`Generated ${indexEntries.length} incidents across ${FAULT_SLUGS.length} fault types.`);
  console.log(`Wrote manifests to ${OUTPUT_DIR}`);
}

if (process.argv[1] === import.meta.filename) {
  main();
}
