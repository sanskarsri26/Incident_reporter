import type { EvidenceCatalogItem } from "@/lib/gemini/types";
import type { RetrievedDocument } from "@/lib/retrieval/document-retrieval";
import type { SimilarIncident } from "@/lib/retrieval/similar-incidents";
import type { LogEvent, MetricEvent } from "@/lib/types";

// Caps the per-source-type contribution to the evidence catalog. Without
// this, a longer-duration incident's raw log/metric event count flows
// straight into the catalog with no bound -- measured up to 326 metric
// events for a single incident in this dataset -- and every one of those
// gets re-serialized into all 5 LLM prompts per investigation (1
// candidates + up to 3 verify + 1 actions), which is both a real cost
// concern with a paid provider and unnecessary: most of that volume is
// baseline traffic noise, not diagnostic signal. Keeps the
// highest-count log templates and most extreme metric values, the same
// "most likely diagnostic" heuristic lib/investigation/summary.ts already
// uses for the prompt's summary section.
const MAX_LOG_EVIDENCE = 40;
const MAX_METRIC_EVIDENCE = 40;

export function buildEvidenceCatalog(
  logEvents: LogEvent[],
  metricEvents: MetricEvent[],
  retrievedDocuments: RetrievedDocument[],
  similarIncidents: SimilarIncident[],
): EvidenceCatalogItem[] {
  const catalog: EvidenceCatalogItem[] = [];

  const cappedLogEvents = [...logEvents].sort((a, b) => b.count - a.count).slice(0, MAX_LOG_EVIDENCE);
  const cappedMetricEvents = [...metricEvents].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, MAX_METRIC_EVIDENCE);

  cappedLogEvents.forEach((event, index) => {
    catalog.push({
      id: `LOG-${index + 1}`,
      sourceType: "log_event",
      sourceId: event.id,
      summary: `${event.service} [${event.level}] ${event.template} (x${event.count}) at ${event.timestamp}`,
    });
  });

  cappedMetricEvents.forEach((event, index) => {
    catalog.push({
      id: `METRIC-${index + 1}`,
      sourceType: "metric_event",
      sourceId: event.id,
      summary: `${event.service} ${event.metric} = ${event.value} at ${event.timestamp}`,
    });
  });

  retrievedDocuments.forEach((retrieved, index) => {
    const { document } = retrieved;
    catalog.push({
      id: `DOC-${index + 1}`,
      sourceType: "document",
      sourceId: document.id,
      summary: `${document.title}: ${document.body.slice(0, 200)}`,
      similarity: retrieved.combinedScore,
    });
  });

  similarIncidents.forEach((similar, index) => {
    // Deliberately excludes rootCauseTruth: a real production system would
    // not have a confirmed-root-cause label on a past incident handed to it
    // as free RAG context, and this app's own UI claims dataset ground
    // truth isn't shown to the model at investigation time -- that claim
    // must actually be true for historical incidents too, not just the one
    // under investigation. Represent past incidents by symptom (title)
    // only, the way a real "similar past incidents" feature would.
    catalog.push({
      id: `INC-${index + 1}`,
      sourceType: "incident",
      sourceId: similar.incident.id,
      summary: `${similar.incident.id}: ${similar.incident.title}`,
      similarity: similar.similarity,
    });
  });

  return catalog;
}
