import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Incident, LogEvent, MetricEvent } from "@/lib/types";

// process.cwd(), not import.meta.dirname: this module is reachable from
// every API route via lib/db/auto-seed.ts, and import.meta.dirname is
// undefined in Next's build-time page-data-collection evaluation context.
// process.cwd() is reliable there, in `next dev`/`next start`, and for
// standalone `tsx` script runs, all of which run from the repo root.
const MANIFESTS_DIR = path.resolve(process.cwd(), "data", "incident-manifests");

export interface IncidentManifestFile {
  incident: Incident;
  manifest: {
    incidentId: string;
    fault: string;
    rootService: string;
    affectedServices: string[];
    expectedEvidence: string[];
    validActions: string[];
  };
  logEvents: LogEvent[];
  metricEvents: MetricEvent[];
}

export function loadIncidentManifests(manifestsDir: string = MANIFESTS_DIR): IncidentManifestFile[] {
  let files: string[] = [];
  try {
    files = readdirSync(manifestsDir).filter((f) => f.endsWith(".json") && f !== "index.json");
  } catch {
    return [];
  }

  return files.map((file) => JSON.parse(readFileSync(path.join(manifestsDir, file), "utf-8")) as IncidentManifestFile);
}
