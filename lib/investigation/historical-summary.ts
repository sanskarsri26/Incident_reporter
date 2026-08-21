import type { Incident } from "@/lib/types";

export function buildHistoricalSummary(incident: Incident): string {
  return `${incident.title}. Affected services: ${incident.affectedServices.join(", ") || "unknown"}.`;
}
