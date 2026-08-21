import { describe, it, expect } from "vitest";
import { createSupabaseRepositoryFromClient } from "@/lib/db/supabase-repository";
import { createFakeSupabaseClient } from "./fake-supabase-client";
import type { Incident, LogEvent, MetricEvent, DocumentRecord, AnalysisRun, Prediction, Evidence, Recommendation, Feedback } from "@/lib/types";

function repo() {
  return createSupabaseRepositoryFromClient(createFakeSupabaseClient());
}

const sampleIncident: Incident = {
  id: "INC-0001",
  title: "DB connection pool exhaustion",
  severity: "sev1",
  status: "resolved",
  startedAt: "2026-01-01T00:00:00.000Z",
  resolvedAt: "2026-01-01T00:30:00.000Z",
  rootCauseTruth: "db_connection_pool_exhaustion",
  affectedServices: ["payment-service", "checkout-service"],
};

describe("Supabase repository (against a fake postgrest client)", () => {
  it("round-trips an incident through upsertIncident / listIncidents / getIncident with correct column mapping", async () => {
    const r = repo();
    await r.upsertIncident(sampleIncident);

    expect(await r.listIncidents()).toEqual([sampleIncident]);
    expect(await r.getIncident("INC-0001")).toEqual(sampleIncident);
    expect(await r.getIncident("missing")).toBeNull();
  });

  it("upsertIncident is idempotent on id (a second upsert replaces the row, not appends)", async () => {
    const r = repo();
    await r.upsertIncident(sampleIncident);
    await r.upsertIncident({ ...sampleIncident, title: "Updated title" });
    const all = await r.listIncidents();
    expect(all).toHaveLength(1);
    expect(all[0]?.title).toBe("Updated title");
  });

  it("round-trips log and metric events, scoped by incident id", async () => {
    const r = repo();
    const logEvents: LogEvent[] = [
      { id: "L1", incidentId: "INC-1", timestamp: "t1", service: "postgres", level: "error", template: "timeout", count: 3 },
      { id: "L2", incidentId: "INC-2", timestamp: "t1", service: "redis", level: "warn", template: "slow", count: 1 },
    ];
    const metricEvents: MetricEvent[] = [
      { id: "M1", incidentId: "INC-1", timestamp: "t1", service: "postgres", metric: "active_connections", value: 20 },
    ];
    await r.insertLogEvents(logEvents);
    await r.insertMetricEvents(metricEvents);

    expect(await r.listLogEvents("INC-1")).toEqual([logEvents[0]]);
    expect(await r.listLogEvents("INC-2")).toEqual([logEvents[1]]);
    expect(await r.listMetricEvents("INC-1")).toEqual(metricEvents);
  });

  it("round-trips a document including a null embedding", async () => {
    const r = repo();
    const doc: DocumentRecord = { id: "DOC-1", title: "Runbook", body: "inspect connections", docType: "runbook", embedding: null };
    await r.upsertDocument(doc);
    expect(await r.listDocuments()).toEqual([doc]);
  });

  it("round-trips a document with a real embedding vector, through PostgREST's real string serialization of a vector column", async () => {
    // Real PostgREST returns a pgvector column as a JSON *string* like
    // "[0.1,0.2,0.3]", not a native array (see the fake client's select
    // path, which mimics this). A `row.embedding as number[]` cast without
    // parsing would silently return a string here, and cosineSimilarity
    // would iterate its characters instead of numbers -- this test would
    // have failed against the old implementation.
    const r = repo();
    const doc: DocumentRecord = { id: "DOC-1", title: "Runbook", body: "inspect connections", docType: "runbook", embedding: [0.1, 0.2, 0.3] };
    await r.upsertDocument(doc);
    const [saved] = await r.listDocuments();
    expect(saved?.embedding).toEqual([0.1, 0.2, 0.3]);
    expect(saved?.embedding?.every((v) => typeof v === "number")).toBe(true);
  });

  it("insertLogEvents/insertMetricEvents are idempotent -- re-running the seed script twice does not fail on a duplicate key", async () => {
    const r = repo();
    const logEvents: LogEvent[] = [{ id: "L1", incidentId: "INC-1", timestamp: "t1", service: "postgres", level: "error", template: "timeout", count: 3 }];
    const metricEvents: MetricEvent[] = [{ id: "M1", incidentId: "INC-1", timestamp: "t1", service: "postgres", metric: "active_connections", value: 20 }];

    await r.insertLogEvents(logEvents);
    await r.insertMetricEvents(metricEvents);
    // A second run against the same ids must not throw and must not
    // duplicate rows.
    await expect(r.insertLogEvents(logEvents)).resolves.not.toThrow();
    await expect(r.insertMetricEvents(metricEvents)).resolves.not.toThrow();

    expect(await r.listLogEvents("INC-1")).toEqual(logEvents);
    expect(await r.listMetricEvents("INC-1")).toEqual(metricEvents);
  });

  it("saves and retrieves a full analysis run: predictions, evidence, and recommendations, in FK order", async () => {
    const r = repo();
    const run: AnalysisRun = { id: "RUN-1", incidentId: "INC-1", model: "mock", promptVersion: "v1", latencyMs: 120, status: "succeeded", createdAt: "2026-01-01T00:00:00.000Z" };
    const predictions: Prediction[] = [{ id: "PRED-1", analysisRunId: "RUN-1", rootCause: "db_connection_pool_exhaustion", rank: 1, confidence: 0.9 }];
    const evidence: Evidence[] = [{ id: "EVID-1", predictionId: "PRED-1", sourceType: "log_event", sourceId: "L1", supportType: "supporting" }];
    const recommendations: Recommendation[] = [{ id: "REC-1", analysisRunId: "RUN-1", action: "inspect connections", priority: 1 }];

    await r.saveAnalysisRun(run);
    await r.savePredictions(predictions);
    await r.saveEvidence(evidence);
    await r.saveRecommendations(recommendations);

    expect(await r.getLatestAnalysisRun("INC-1")).toEqual(run);
    expect(await r.getPredictionsForRun("RUN-1")).toEqual(predictions);
    expect(await r.getEvidenceForPrediction("PRED-1")).toEqual(evidence);
    expect(await r.getRecommendationsForRun("RUN-1")).toEqual(recommendations);
  });

  it("getLatestAnalysisRun returns the most recently created run for that incident", async () => {
    const r = repo();
    await r.saveAnalysisRun({ id: "RUN-1", incidentId: "INC-1", model: "mock", promptVersion: "v1", latencyMs: 100, status: "succeeded", createdAt: "2026-01-01T00:00:00.000Z" });
    await r.saveAnalysisRun({ id: "RUN-2", incidentId: "INC-1", model: "mock", promptVersion: "v1", latencyMs: 90, status: "succeeded", createdAt: "2026-01-02T00:00:00.000Z" });
    expect((await r.getLatestAnalysisRun("INC-1"))?.id).toBe("RUN-2");
  });

  it("getLatestAnalysisRun returns null when no run exists for that incident", async () => {
    const r = repo();
    expect(await r.getLatestAnalysisRun("INC-NONE")).toBeNull();
  });

  it("round-trips feedback, including a null incidentId and null rating", async () => {
    const r = repo();
    const feedback: Feedback = { id: "F1", incidentId: null, message: "General feedback", rating: null, createdAt: "2026-01-01T00:00:00.000Z" };
    await r.saveFeedback(feedback);
    expect(await r.listFeedback()).toEqual([feedback]);
  });

  it("round-trips services and service dependencies", async () => {
    const r = repo();
    await r.upsertService({ id: "postgres", name: "Postgres", type: "database" });
    await r.upsertServiceDependency({ sourceService: "checkout-service", targetService: "payment-service" });

    expect(await r.listServices()).toEqual([{ id: "postgres", name: "Postgres", type: "database" }]);
    expect(await r.listServiceDependencies()).toEqual([{ sourceService: "checkout-service", targetService: "payment-service" }]);
  });
});
