import { describe, it, expect } from "vitest";
import { findSimilarIncidents } from "@/lib/retrieval/similar-incidents";
import { createMockEmbeddingProvider } from "@/lib/gemini/mock-provider";
import type { Incident } from "@/lib/types";

function incident(id: string, rootCauseTruth: string): Incident {
  return {
    id,
    title: id,
    severity: "sev2",
    status: "resolved",
    startedAt: "2026-01-01T00:00:00.000Z",
    resolvedAt: "2026-01-01T01:00:00.000Z",
    rootCauseTruth,
    affectedServices: [],
  };
}

describe("findSimilarIncidents", () => {
  it("ranks the incident with the more similar summary first and excludes the target itself", async () => {
    const provider = createMockEmbeddingProvider();
    const candidates = [
      { incident: incident("INC-1", "db_connection_pool_exhaustion"), summary: "postgres connection pool exhausted, timeouts" },
      { incident: incident("INC-2", "cpu_spike"), summary: "cpu saturation on inventory-service" },
      { incident: incident("INC-TARGET", "db_connection_pool_exhaustion"), summary: "target incident, should be excluded" },
    ];

    const results = await findSimilarIncidents(
      "database connection pool timeout errors",
      "INC-TARGET",
      candidates,
      provider,
      5,
    );

    expect(results.map((r) => r.incident.id)).not.toContain("INC-TARGET");
    expect(results[0]?.incident.id).toBe("INC-1");
  });

  it("returns an empty list when there are no other incidents to compare against", async () => {
    const provider = createMockEmbeddingProvider();
    const results = await findSimilarIncidents("x", "INC-ONLY", [{ incident: incident("INC-ONLY", "x"), summary: "x" }], provider, 5);
    expect(results).toEqual([]);
  });

  it("respects topK", async () => {
    const provider = createMockEmbeddingProvider();
    const candidates = [
      { incident: incident("INC-1", "a"), summary: "alpha incident" },
      { incident: incident("INC-2", "b"), summary: "beta incident" },
      { incident: incident("INC-3", "c"), summary: "gamma incident" },
    ];
    const results = await findSimilarIncidents("target incident", "INC-TARGET", candidates, provider, 2);
    expect(results).toHaveLength(2);
  });
});
