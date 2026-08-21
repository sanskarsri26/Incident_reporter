import { describe, it, expect } from "vitest";
import { createMockLLMProvider, createMockEmbeddingProvider } from "@/lib/gemini/mock-provider";
import type { EvidenceCatalogItem } from "@/lib/gemini/types";

const poolExhaustionEvidence: EvidenceCatalogItem[] = [
  { id: "LOG-1", sourceType: "log_event", sourceId: "L1", summary: "postgres: connection timeout waiting for pool" },
  { id: "METRIC-1", sourceType: "metric_event", sourceId: "M1", summary: "active_connections reached pool limit of 20" },
  { id: "LOG-2", sourceType: "log_event", sourceId: "L2", summary: "payment-service: worker retry after db error" },
  { id: "DOC-1", sourceType: "document", sourceId: "D1", summary: "runbook: inspect connections and long transactions" },
];

describe("createMockLLMProvider", () => {
  it("generateCandidates ranks the connection-pool fault first given pool-exhaustion evidence", async () => {
    const provider = createMockLLMProvider();
    const { candidates } = await provider.generateCandidates({
      incidentSummary: "Checkout errors spiking, payment-service timing out.",
      evidenceCatalog: poolExhaustionEvidence,
      maxCandidates: 3,
    });

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0]?.rootCause).toBe("db_connection_pool_exhaustion");
    expect(candidates[0]?.supportingEvidenceIds).toContain("LOG-1");
    expect(candidates[0]?.score).toBeGreaterThan(0);
    expect(candidates[0]?.score).toBeLessThanOrEqual(1);
  });

  it("generateCandidates is deterministic across repeated calls with the same input", async () => {
    const provider = createMockLLMProvider();
    const first = await provider.generateCandidates({
      incidentSummary: "x",
      evidenceCatalog: poolExhaustionEvidence,
      maxCandidates: 3,
    });
    const second = await provider.generateCandidates({
      incidentSummary: "x",
      evidenceCatalog: poolExhaustionEvidence,
      maxCandidates: 3,
    });
    expect(second).toEqual(first);
  });

  it("generateCandidates respects maxCandidates", async () => {
    const provider = createMockLLMProvider();
    const { candidates } = await provider.generateCandidates({
      incidentSummary: "x",
      evidenceCatalog: poolExhaustionEvidence,
      maxCandidates: 1,
    });
    expect(candidates).toHaveLength(1);
  });

  it("verifyCandidate only confirms hard evidence (log/metric), not documents", async () => {
    const provider = createMockLLMProvider();
    const candidate = {
      rootCause: "db_connection_pool_exhaustion",
      score: 0.8,
      supportingEvidenceIds: ["LOG-1", "METRIC-1", "DOC-1"],
      contradictingEvidenceIds: [],
    };
    const { confirmedEvidenceIds } = await provider.verifyCandidate({
      incidentSummary: "x",
      candidate,
      evidenceCatalog: poolExhaustionEvidence,
    });
    expect(confirmedEvidenceIds).toContain("LOG-1");
    expect(confirmedEvidenceIds).toContain("METRIC-1");
    expect(confirmedEvidenceIds).not.toContain("DOC-1");
  });

  it("generateActions returns known actions for a recognized fault", async () => {
    const provider = createMockLLMProvider();
    const { actions } = await provider.generateActions({
      incidentSummary: "x",
      finalRootCause: "db_connection_pool_exhaustion",
      evidenceCatalog: poolExhaustionEvidence,
    });
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.some((a) => a.toLowerCase().includes("connection"))).toBe(true);
  });

  it("generateActions falls back to generic actions for an unrecognized fault", async () => {
    const provider = createMockLLMProvider();
    const { actions } = await provider.generateActions({
      incidentSummary: "x",
      finalRootCause: "totally_unknown_fault",
      evidenceCatalog: [],
    });
    expect(actions.length).toBeGreaterThan(0);
  });
});

describe("createMockEmbeddingProvider", () => {
  it("returns one vector per input text, all the same length", async () => {
    const provider = createMockEmbeddingProvider();
    const vectors = await provider.embed(["connection pool exhausted", "cpu spike on inventory-service"]);
    expect(vectors).toHaveLength(2);
    expect(vectors[0]).toHaveLength(vectors[1]?.length ?? -1);
  });

  it("is deterministic for the same text", async () => {
    const provider = createMockEmbeddingProvider();
    const [a] = await provider.embed(["connection pool exhausted"]);
    const [b] = await provider.embed(["connection pool exhausted"]);
    expect(a).toEqual(b);
  });

  it("produces higher cosine similarity for related text than unrelated text", async () => {
    const provider = createMockEmbeddingProvider();
    const [base, related, unrelated] = await provider.embed([
      "postgres connection pool exhausted, timeouts",
      "database connection pool timeout errors",
      "unrelated marketing newsletter content about recipes",
    ]);

    function cosine(a: number[], b: number[]): number {
      const dot = a.reduce((sum, v, i) => sum + v * (b[i] ?? 0), 0);
      const magA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
      const magB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
      return dot / (magA * magB || 1);
    }

    const simRelated = cosine(base!, related!);
    const simUnrelated = cosine(base!, unrelated!);
    expect(simRelated).toBeGreaterThan(simUnrelated);
  });
});
