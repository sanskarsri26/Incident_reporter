import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resetRepositoryForTests, getRepository } from "@/lib/db/index";
import { resetProvidersForTests } from "@/lib/gemini/index";
import { resetRateLimiterForTests } from "@/lib/security/rate-limit";
import { POST as investigate } from "@/app/api/incidents/[id]/investigate/route";

const incident = {
  id: "INC-0042",
  title: "Checkout errors spiking",
  severity: "sev1" as const,
  status: "resolved" as const,
  startedAt: "2026-01-01T10:00:00.000Z",
  resolvedAt: "2026-01-01T10:30:00.000Z",
  rootCauseTruth: "db_connection_pool_exhaustion",
  affectedServices: ["checkout-service", "payment-service"],
};

async function seed() {
  const repo = getRepository();
  await repo.upsertIncident(incident);
  await repo.insertLogEvents([
    { id: "L1", incidentId: incident.id, timestamp: "2026-01-01T10:05:00.000Z", service: "postgres", level: "error", template: "connection pool limit reached, connection timeout", count: 5 },
  ]);
  await repo.insertMetricEvents([
    { id: "M1", incidentId: incident.id, timestamp: "2026-01-01T10:05:30.000Z", service: "postgres", metric: "active_connections", value: 20 },
  ]);
  await repo.upsertDocument({
    id: "DOC-1",
    title: "Connection pool runbook",
    body: "diagnose postgres connection pool exhaustion and connection timeout issues",
    docType: "runbook",
    embedding: null,
  });
}

function postRequest(): Request {
  return new Request("http://localhost/api/incidents/INC-0042/investigate", {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.1" },
  });
}

describe("POST /api/incidents/:id/investigate", () => {
  beforeEach(async () => {
    resetRepositoryForTests();
    resetProvidersForTests();
    resetRateLimiterForTests();
    await seed();
  });

  it("returns 404 for an incident that does not exist", async () => {
    const response = await investigate(postRequest(), { params: Promise.resolve({ id: "missing" }) });
    expect(response.status).toBe(404);
  });

  it("returns 400 for an invalid incident id", async () => {
    const response = await investigate(postRequest(), { params: Promise.resolve({ id: "" }) });
    expect(response.status).toBe(400);
  });

  it("runs the full pipeline and persists the analysis run, predictions, and evidence", async () => {
    const response = await investigate(postRequest(), { params: Promise.resolve({ id: incident.id }) });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.finalRootCause).toBe("db_connection_pool_exhaustion");
    expect(body.predictions.length).toBeGreaterThan(0);

    const repo = getRepository();
    const savedRun = await repo.getLatestAnalysisRun(incident.id);
    expect(savedRun?.status).toBe("succeeded");
    const savedPredictions = await repo.getPredictionsForRun(savedRun!.id);
    expect(savedPredictions.length).toBe(body.predictions.length);
  });

  it("returns 429 once the rate limit is exceeded", async () => {
    let lastResponse: Response | undefined;
    for (let i = 0; i < 25; i += 1) {
      lastResponse = await investigate(postRequest(), { params: Promise.resolve({ id: incident.id }) });
    }
    expect(lastResponse?.status).toBe(429);
  });

  describe("upstream Gemini quota errors", () => {
    const originalFetch = globalThis.fetch;
    const originalKey = process.env.GEMINI_API_KEY;

    beforeEach(() => {
      process.env.GEMINI_API_KEY = "test-key";
      resetProvidersForTests();
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => "Resource exhausted",
      }) as unknown as typeof fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
      if (originalKey) process.env.GEMINI_API_KEY = originalKey;
      else delete process.env.GEMINI_API_KEY;
      resetProvidersForTests();
    });

    it("returns a friendly 429 (not a bare 502) when the upstream Gemini API is rate-limited", async () => {
      const response = await investigate(postRequest(), { params: Promise.resolve({ id: incident.id }) });
      expect(response.status).toBe(429);
      const body = await response.json();
      expect(body.error).toMatch(/rate-limited|quota/i);

      const repo = getRepository();
      const savedRun = await repo.getLatestAnalysisRun(incident.id);
      expect(savedRun?.status).toBe("failed");
    });
  });
});
