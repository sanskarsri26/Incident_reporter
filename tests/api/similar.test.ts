import { describe, it, expect, beforeEach } from "vitest";
import { resetRepositoryForTests, getRepository } from "@/lib/db/index";
import { resetProvidersForTests } from "@/lib/gemini/index";
import { resetRateLimiterForTests } from "@/lib/security/rate-limit";
import { GET as getSimilar } from "@/app/api/incidents/[id]/similar/route";
import type { Incident } from "@/lib/types";

function similarRequest(ip = "203.0.113.7"): Request {
  return new Request("http://localhost", { headers: { "x-forwarded-for": ip } });
}

function makeIncident(id: string, title: string, affected: string[]): Incident {
  return {
    id,
    title,
    severity: "sev2",
    status: "resolved",
    startedAt: "2026-01-01T00:00:00.000Z",
    resolvedAt: "2026-01-01T01:00:00.000Z",
    rootCauseTruth: "db_connection_pool_exhaustion",
    affectedServices: affected,
  };
}

describe("GET /api/incidents/:id/similar", () => {
  beforeEach(async () => {
    resetRepositoryForTests();
    resetProvidersForTests();
    resetRateLimiterForTests();
    const repo = getRepository();
    await repo.upsertIncident(makeIncident("INC-TARGET", "Postgres connection pool exhausted", ["payment-service"]));
    await repo.upsertIncident(makeIncident("INC-1", "Postgres connection pool exhausted again", ["payment-service"]));
    await repo.upsertIncident(makeIncident("INC-2", "Totally unrelated inventory cpu spike", ["inventory-service"]));
  });

  it("returns 404 for an unknown incident", async () => {
    const response = await getSimilar(similarRequest(), { params: Promise.resolve({ id: "missing" }) });
    expect(response.status).toBe(404);
  });

  it("excludes the target incident and ranks the more similar incident first", async () => {
    const response = await getSimilar(similarRequest(), { params: Promise.resolve({ id: "INC-TARGET" }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    const ids = body.similar.map((s: { incident: Incident }) => s.incident.id);
    expect(ids).not.toContain("INC-TARGET");
    expect(ids[0]).toBe("INC-1");
  });

  it("returns 429 once the rate limit is exceeded", async () => {
    let lastResponse: Response | undefined;
    for (let i = 0; i < 25; i += 1) {
      lastResponse = await getSimilar(similarRequest("203.0.113.8"), { params: Promise.resolve({ id: "INC-TARGET" }) });
    }
    expect(lastResponse?.status).toBe(429);
  });
});
