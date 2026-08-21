import { describe, it, expect, beforeEach } from "vitest";
import { findSimilarIncidents, resetSimilarIncidentsCacheForTests } from "@/lib/retrieval/similar-incidents";
import { createMockEmbeddingProvider } from "@/lib/gemini/mock-provider";
import type { EmbeddingProvider } from "@/lib/gemini/types";
import type { Incident } from "@/lib/types";

function countingEmbeddingProvider(): EmbeddingProvider & { callCount: number; totalTextsEmbedded: number } {
  const inner = createMockEmbeddingProvider();
  const wrapper = {
    name: inner.name,
    callCount: 0,
    totalTextsEmbedded: 0,
    async embed(texts: string[]) {
      wrapper.callCount += 1;
      wrapper.totalTextsEmbedded += texts.length;
      return inner.embed(texts);
    },
  };
  return wrapper;
}

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
  beforeEach(() => {
    resetSimilarIncidentsCacheForTests();
  });

  it("caches embeddings by summary text -- a second call with the same incidents re-embeds nothing", async () => {
    const provider = countingEmbeddingProvider();
    const candidates = [
      { incident: incident("INC-1", "db_connection_pool_exhaustion"), summary: "postgres connection pool exhausted, timeouts" },
      { incident: incident("INC-2", "cpu_spike"), summary: "cpu saturation on inventory-service" },
    ];

    await findSimilarIncidents("target summary text", "INC-TARGET", candidates, provider, 5);
    expect(provider.totalTextsEmbedded).toBe(3); // target + 2 candidates, all uncached

    await findSimilarIncidents("target summary text", "INC-TARGET", candidates, provider, 5);
    expect(provider.totalTextsEmbedded).toBe(3); // unchanged -- the second call was a full cache hit
    expect(provider.callCount).toBe(1); // embed() was never called a second time at all
  });

  it("only embeds the new/changed text when one incident's summary changes between calls", async () => {
    const provider = countingEmbeddingProvider();
    const candidates = [
      { incident: incident("INC-1", "db_connection_pool_exhaustion"), summary: "postgres connection pool exhausted, timeouts" },
    ];

    await findSimilarIncidents("target summary text", "INC-TARGET", candidates, provider, 5);
    expect(provider.totalTextsEmbedded).toBe(2);

    const updatedCandidates = [{ ...candidates[0]!, summary: "a brand new summary never seen before" }];
    await findSimilarIncidents("target summary text", "INC-TARGET", updatedCandidates, provider, 5);
    // Only the one new text should have needed a fresh embedding call --
    // "target summary text" was already cached.
    expect(provider.totalTextsEmbedded).toBe(3);
  });

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
