import { describe, it, expect, beforeEach } from "vitest";
import { resetRepositoryForTests, getRepository } from "@/lib/db/index";
import { GET as getTimeline } from "@/app/api/incidents/[id]/timeline/route";

describe("GET /api/incidents/:id/timeline", () => {
  beforeEach(async () => {
    resetRepositoryForTests();
    const repo = getRepository();
    await repo.upsertIncident({
      id: "INC-1",
      title: "x",
      severity: "sev2",
      status: "resolved",
      startedAt: "2026-01-01T00:00:00.000Z",
      resolvedAt: null,
      rootCauseTruth: "x",
      affectedServices: [],
    });
    await repo.insertLogEvents([{ id: "L1", incidentId: "INC-1", timestamp: "2026-01-01T10:05:00.000Z", service: "postgres", level: "error", template: "timeout", count: 1 }]);
    await repo.insertMetricEvents([{ id: "M1", incidentId: "INC-1", timestamp: "2026-01-01T10:00:00.000Z", service: "postgres", metric: "active_connections", value: 20 }]);
  });

  it("returns 404 for an unknown incident", async () => {
    const response = await getTimeline(new Request("http://localhost"), { params: Promise.resolve({ id: "missing" }) });
    expect(response.status).toBe(404);
  });

  it("returns a merged, sorted timeline for a known incident", async () => {
    const response = await getTimeline(new Request("http://localhost"), { params: Promise.resolve({ id: "INC-1" }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.timeline).toHaveLength(2);
    expect(body.timeline[0].kind).toBe("metric");
  });
});
