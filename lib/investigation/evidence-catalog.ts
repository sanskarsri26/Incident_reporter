import type { EvidenceCatalogItem } from "@/lib/gemini/types";
import type { RetrievedDocument } from "@/lib/retrieval/document-retrieval";
import type { SimilarIncident } from "@/lib/retrieval/similar-incidents";
import type { LogEvent, MetricEvent } from "@/lib/types";

export function buildEvidenceCatalog(
  logEvents: LogEvent[],
  metricEvents: MetricEvent[],
  retrievedDocuments: RetrievedDocument[],
  similarIncidents: SimilarIncident[],
): EvidenceCatalogItem[] {
  const catalog: EvidenceCatalogItem[] = [];

  logEvents.forEach((event, index) => {
    catalog.push({
      id: `LOG-${index + 1}`,
      sourceType: "log_event",
      sourceId: event.id,
      summary: `${event.service} [${event.level}] ${event.template} (x${event.count}) at ${event.timestamp}`,
    });
  });

  metricEvents.forEach((event, index) => {
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
    catalog.push({
      id: `INC-${index + 1}`,
      sourceType: "incident",
      sourceId: similar.incident.id,
      summary: `${similar.incident.id} (${similar.incident.rootCauseTruth}): ${similar.incident.title}`,
      similarity: similar.similarity,
    });
  });

  return catalog;
}
