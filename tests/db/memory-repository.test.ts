import { describe, it, expect } from "vitest";
import { createMemoryRepository } from "@/lib/db/memory-repository";
import type { Incident } from "@/lib/types";

const sampleIncident: Incident = {
  id: "INC-0001",
  title: "DB connection pool exhaustion",
  severity: "sev1",
  status: "resolved",
  startedAt: "2026-01-01T00:00:00.000Z",
  resolvedAt: null,
  rootCauseTruth: "db_connection_pool_exhaustion",
  affectedServices: ["payment-service"],
};

describe("createMemoryRepository", () => {
  it("returns an empty incident list when unseeded", async () => {
    const repo = createMemoryRepository();
    expect(await repo.listIncidents()).toEqual([]);
  });

  it("round-trips a seeded incident through listIncidents and getIncident", async () => {
    const repo = createMemoryRepository({ incidents: [sampleIncident] });
    expect(await repo.listIncidents()).toEqual([sampleIncident]);
    expect(await repo.getIncident("INC-0001")).toEqual(sampleIncident);
  });

  it("getIncident returns null for an unknown id", async () => {
    const repo = createMemoryRepository();
    expect(await repo.getIncident("missing")).toBeNull();
  });

  it("upsertIncident adds a new incident and is idempotent on id", async () => {
    const repo = createMemoryRepository();
    await repo.upsertIncident(sampleIncident);
    await repo.upsertIncident({ ...sampleIncident, title: "Updated title" });
    const all = await repo.listIncidents();
    expect(all).toHaveLength(1);
    expect(all[0]?.title).toBe("Updated title");
  });

  it("insertLogEvents appends events scoped by incident id", async () => {
    const repo = createMemoryRepository();
    await repo.insertLogEvents([
      { id: "LOG-1", incidentId: "INC-0001", timestamp: "2026-01-01T00:00:00.000Z", service: "postgres", level: "error", template: "connection timeout", count: 3 },
      { id: "LOG-2", incidentId: "INC-0002", timestamp: "2026-01-01T00:00:00.000Z", service: "redis", level: "warn", template: "slow response", count: 1 },
    ]);
    expect(await repo.listLogEvents("INC-0001")).toHaveLength(1);
    expect(await repo.listLogEvents("INC-0002")).toHaveLength(1);
    expect(await repo.listLogEvents("INC-9999")).toEqual([]);
  });

  it("saves and retrieves an analysis run, predictions, evidence, and recommendations end to end", async () => {
    const repo = createMemoryRepository();
    await repo.saveAnalysisRun({
      id: "RUN-1",
      incidentId: "INC-0001",
      model: "mock",
      promptVersion: "v1",
      latencyMs: 120,
      status: "succeeded",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    await repo.savePredictions([
      { id: "PRED-1", analysisRunId: "RUN-1", rootCause: "db_connection_pool_exhaustion", rank: 1, confidence: 0.9 },
    ]);
    await repo.saveEvidence([
      { id: "EVID-1", predictionId: "PRED-1", sourceType: "log_event", sourceId: "LOG-1", supportType: "supporting" },
    ]);
    await repo.saveRecommendations([
      { id: "REC-1", analysisRunId: "RUN-1", action: "inspect active connections", priority: 1 },
    ]);

    const latestRun = await repo.getLatestAnalysisRun("INC-0001");
    expect(latestRun?.id).toBe("RUN-1");

    const predictions = await repo.getPredictionsForRun("RUN-1");
    expect(predictions).toHaveLength(1);

    const evidence = await repo.getEvidenceForPrediction("PRED-1");
    expect(evidence).toHaveLength(1);

    const recommendations = await repo.getRecommendationsForRun("RUN-1");
    expect(recommendations).toHaveLength(1);
  });

  it("getLatestAnalysisRun returns the most recently created run", async () => {
    const repo = createMemoryRepository();
    await repo.saveAnalysisRun({ id: "RUN-1", incidentId: "INC-0001", model: "mock", promptVersion: "v1", latencyMs: 100, status: "succeeded", createdAt: "2026-01-01T00:00:00.000Z" });
    await repo.saveAnalysisRun({ id: "RUN-2", incidentId: "INC-0001", model: "mock", promptVersion: "v1", latencyMs: 90, status: "succeeded", createdAt: "2026-01-02T00:00:00.000Z" });
    const latest = await repo.getLatestAnalysisRun("INC-0001");
    expect(latest?.id).toBe("RUN-2");
  });
});
