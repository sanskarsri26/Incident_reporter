import { describe, it, expect } from "vitest";
import { buildEvidenceCatalog } from "@/lib/investigation/evidence-catalog";
import type { LogEvent, MetricEvent } from "@/lib/types";
import type { RetrievedDocument } from "@/lib/retrieval/document-retrieval";
import type { SimilarIncident } from "@/lib/retrieval/similar-incidents";

const logEvents: LogEvent[] = [
  { id: "L1", incidentId: "INC-1", timestamp: "t1", service: "postgres", level: "error", template: "connection timeout", count: 3 },
];
const metricEvents: MetricEvent[] = [
  { id: "M1", incidentId: "INC-1", timestamp: "t1", service: "postgres", metric: "active_connections", value: 20 },
];
const retrievedDocuments: RetrievedDocument[] = [
  {
    document: { id: "D1", title: "Pool runbook", body: "inspect connections and long transactions", docType: "runbook", embedding: null },
    vectorSimilarity: 0.9,
    keywordScore: 0.5,
    combinedScore: 0.8,
  },
];
const similarIncidents: SimilarIncident[] = [
  {
    incident: {
      id: "INC-0083",
      title: "Similar pool exhaustion",
      severity: "sev1",
      status: "resolved",
      startedAt: "t0",
      resolvedAt: "t1",
      rootCauseTruth: "db_connection_pool_exhaustion",
      affectedServices: [],
      ownerId: null,
    },
    similarity: 0.75,
  },
];

describe("buildEvidenceCatalog", () => {
  it("assigns stable prefixed ids in a fixed order: LOG, METRIC, DOC, INC", () => {
    const catalog = buildEvidenceCatalog(logEvents, metricEvents, retrievedDocuments, similarIncidents);
    expect(catalog.map((c) => c.id)).toEqual(["LOG-1", "METRIC-1", "DOC-1", "INC-1"]);
  });

  it("preserves the source id and type for each catalog item", () => {
    const catalog = buildEvidenceCatalog(logEvents, metricEvents, retrievedDocuments, similarIncidents);
    expect(catalog.find((c) => c.id === "LOG-1")).toMatchObject({ sourceType: "log_event", sourceId: "L1" });
    expect(catalog.find((c) => c.id === "METRIC-1")).toMatchObject({ sourceType: "metric_event", sourceId: "M1" });
    expect(catalog.find((c) => c.id === "DOC-1")).toMatchObject({ sourceType: "document", sourceId: "D1" });
    expect(catalog.find((c) => c.id === "INC-1")).toMatchObject({ sourceType: "incident", sourceId: "INC-0083" });
  });

  it("never includes a historical incident's confirmed root cause in its summary", () => {
    // A real production system would not have a confirmed-root-cause label
    // on a past incident handed to it as free RAG context, and the app's
    // own UI claims dataset ground truth isn't shown to the model -- that
    // must hold for historical incidents' rootCauseTruth too, not just the
    // current incident under investigation.
    const catalog = buildEvidenceCatalog([], [], [], similarIncidents);
    expect(catalog[0]?.summary).not.toContain("db_connection_pool_exhaustion");
    expect(catalog[0]?.summary).toBe("INC-0083: Similar pool exhaustion");
  });

  it("returns an empty catalog when given no evidence sources", () => {
    expect(buildEvidenceCatalog([], [], [], [])).toEqual([]);
  });

  it("caps log and metric events at 40 each, keeping the highest-count/highest-magnitude ones", () => {
    const manyLogEvents: LogEvent[] = Array.from({ length: 100 }, (_, i) => ({
      id: `L${i}`,
      incidentId: "INC-1",
      timestamp: "t1",
      service: "postgres",
      level: "error",
      template: `template-${i}`,
      count: i, // highest index = highest count
    }));
    const manyMetricEvents: MetricEvent[] = Array.from({ length: 100 }, (_, i) => ({
      id: `M${i}`,
      incidentId: "INC-1",
      timestamp: "t1",
      service: "postgres",
      metric: "active_connections",
      value: i, // highest index = highest magnitude
    }));

    const catalog = buildEvidenceCatalog(manyLogEvents, manyMetricEvents, [], []);
    const logItems = catalog.filter((c) => c.sourceType === "log_event");
    const metricItems = catalog.filter((c) => c.sourceType === "metric_event");

    expect(logItems).toHaveLength(40);
    expect(metricItems).toHaveLength(40);
    // The kept log event must be one of the 40 highest-count ones (id L60..L99).
    expect(logItems.every((item) => Number(item.sourceId.slice(1)) >= 60)).toBe(true);
    expect(metricItems.every((item) => Number(item.sourceId.slice(1)) >= 60)).toBe(true);
  });
});
