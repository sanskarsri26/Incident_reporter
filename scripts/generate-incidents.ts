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
import type { Incident, IncidentStatus, LogEvent, MetricEvent, Severity } from "@/lib/types";
import type { GroundTruthManifest } from "@/simulator/types";
import { FAULT_REGISTRY, FAULT_SLUGS } from "@/simulator/fault-injection/index";
import { generateBaselineTraffic } from "@/simulator/traffic/generator";
import { seededRng } from "@/simulator/random";
import { resetEventCounters } from "@/simulator/fault-injection/helpers";

const INCIDENTS_PER_FAULT = 7;
const OUTPUT_DIR = path.resolve(import.meta.dirname, "..", "data", "incident-manifests");
const BASE_DATE = new Date("2026-01-15T00:00:00.000Z");

// Symptom-level titles only -- deliberately not 1:1 with a fault type. An
// incident's title is line 1 of the prompt sent to the model
// (lib/investigation/summary.ts), so a title that names the diagnosis (e.g.
// always titling a db_connection_pool_exhaustion incident "Database
// connection pool exhaustion") would let the model score well just by
// echoing it back, measuring nothing about diagnostic reasoning. These read
// the way an on-call page or a customer-facing status update would, before
// anyone has diagnosed the cause. Picked pseudo-randomly per incident (see
// `titleRng` below) so the same fault type produces varied titles and the
// same title can appear across different fault types.
const SYMPTOM_TITLES = [
  "Checkout error rate elevated",
  "Payment latency spike reported by on-call",
  "Elevated 5xx rate on checkout-service",
  "Customer reports of slow checkout",
  "Alerting threshold breached in production",
  "Degraded response times observed",
  "Spike in failed transactions",
  "On-call paged for service degradation",
  "Increased timeouts reported across checkout flow",
  "Intermittent failures affecting order placement",
];

function zeroPad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

function maxTimestamp(events: Array<{ timestamp: string }>): string {
  return events.reduce((max, e) => (e.timestamp > max ? e.timestamp : max), events[0]?.timestamp ?? "");
}

// Weighted like a real severity distribution: most incidents are sev3/sev4,
// sev1 is rare. Deliberately independent of fault type -- see the
// SYMPTOM_TITLES comment above for why decoupling matters.
const SEVERITY_WEIGHTS: Array<{ severity: Severity; weight: number }> = [
  { severity: "sev1", weight: 0.1 },
  { severity: "sev2", weight: 0.25 },
  { severity: "sev3", weight: 0.35 },
  { severity: "sev4", weight: 0.3 },
];

function pickWeightedSeverity(rng: () => number): Severity {
  const total = SEVERITY_WEIGHTS.reduce((sum, o) => sum + o.weight, 0);
  let roll = rng() * total;
  for (const option of SEVERITY_WEIGHTS) {
    roll -= option.weight;
    if (roll <= 0) return option.severity;
  }
  return SEVERITY_WEIGHTS[SEVERITY_WEIGHTS.length - 1]!.severity;
}

// Most synthetic incidents are "resolved" (this dataset is a closed,
// historical training/eval set), but a small deterministic fraction are
// left "investigating"/"open" so the dashboard's open-incident count isn't
// permanently zero.
const STATUS_WEIGHTS: Array<{ status: IncidentStatus; weight: number }> = [
  { status: "resolved", weight: 0.85 },
  { status: "investigating", weight: 0.1 },
  { status: "open", weight: 0.05 },
];

function pickWeightedStatus(rng: () => number): IncidentStatus {
  const total = STATUS_WEIGHTS.reduce((sum, o) => sum + o.weight, 0);
  let roll = rng() * total;
  for (const option of STATUS_WEIGHTS) {
    roll -= option.weight;
    if (roll <= 0) return option.status;
  }
  return STATUS_WEIGHTS[STATUS_WEIGHTS.length - 1]!.status;
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

  resetEventCounters();
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

  // A separate, independent RNG stream from `scheduleRng` -- these fields
  // are cosmetic/presentation-only and must not perturb the timing/duration
  // values consumed above, which downstream fault-injector event generation
  // depends on staying byte-for-byte identical.
  const presentationRng = seededRng(incidentId, "presentation");
  const title = SYMPTOM_TITLES[Math.floor(presentationRng() * SYMPTOM_TITLES.length)] ?? SYMPTOM_TITLES[0]!;
  const severity = pickWeightedSeverity(presentationRng);
  const status = pickWeightedStatus(presentationRng);

  const incident: Incident = {
    id: incidentId,
    title,
    severity,
    status,
    startedAt: startedAt.toISOString(),
    resolvedAt: status === "resolved" ? resolvedAt.toISOString() : null,
    rootCauseTruth: fault,
    affectedServices: faultResult.manifest.affectedServices,
    ownerId: null,
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
