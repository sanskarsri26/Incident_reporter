import { describe, it, expect, vi } from "vitest";
import { createGeminiEmbeddingProvider, createGeminiLLMProvider } from "@/lib/gemini/gemini-provider";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function generateContentResponse(payload: unknown): Response {
  return jsonResponse({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] });
}

describe("createGeminiLLMProvider", () => {
  it("generateCandidates calls the generateContent endpoint with the API key and parses the JSON response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      generateContentResponse({
        candidates: [{ rootCause: "db_connection_pool_exhaustion", score: 0.9, supportingEvidenceIds: ["LOG-1"], contradictingEvidenceIds: [] }],
      }),
    );
    const provider = createGeminiLLMProvider({ apiKey: "test-key", fetchImpl });

    const result = await provider.generateCandidates({
      incidentSummary: "checkout failing",
      evidenceCatalog: [{ id: "LOG-1", sourceType: "log_event", sourceId: "L1", summary: "timeout" }],
      maxCandidates: 3,
    });

    expect(result.candidates[0]?.rootCause).toBe("db_connection_pool_exhaustion");
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("generateContent");
    // The API key must travel via the x-goog-api-key header, never the URL
    // query string -- URLs get logged by proxies/CDNs/server access logs.
    expect(url).not.toContain("test-key");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
    expect(String(init.body)).toContain("checkout failing");
  });

  it("throws when the API responds with a non-ok status, without leaking the response body into the error message", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: "quota exceeded", secretDetail: "internal-trace-id-12345" }, false, 429));
    const provider = createGeminiLLMProvider({ apiKey: "test-key", fetchImpl });

    await expect(
      provider.generateCandidates({ incidentSummary: "x", evidenceCatalog: [], maxCandidates: 1 }),
    ).rejects.toThrow(/429/);

    try {
      await provider.generateCandidates({ incidentSummary: "x", evidenceCatalog: [], maxCandidates: 1 });
    } catch (error) {
      expect((error as Error).message).not.toContain("internal-trace-id-12345");
    }
  });

  it("throws when the model response is not valid JSON matching the expected schema", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(generateContentResponse({ candidates: [{ rootCause: 123 }] }));
    const provider = createGeminiLLMProvider({ apiKey: "test-key", fetchImpl });

    await expect(
      provider.generateCandidates({ incidentSummary: "x", evidenceCatalog: [], maxCandidates: 1 }),
    ).rejects.toThrow();
  });

  it("verifyCandidate parses confirmedEvidenceIds", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(generateContentResponse({ confirmedEvidenceIds: ["LOG-1"] }));
    const provider = createGeminiLLMProvider({ apiKey: "test-key", fetchImpl });

    const result = await provider.verifyCandidate({
      incidentSummary: "x",
      candidate: { rootCause: "y", score: 0.5, supportingEvidenceIds: ["LOG-1"], contradictingEvidenceIds: [] },
      evidenceCatalog: [],
    });

    expect(result.confirmedEvidenceIds).toEqual(["LOG-1"]);
  });

  it("generateActions parses the actions list", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(generateContentResponse({ actions: ["inspect connections"] }));
    const provider = createGeminiLLMProvider({ apiKey: "test-key", fetchImpl });

    const result = await provider.generateActions({ incidentSummary: "x", finalRootCause: "y", evidenceCatalog: [] });
    expect(result.actions).toEqual(["inspect connections"]);
  });
});

describe("createGeminiEmbeddingProvider", () => {
  it("calls batchEmbedContents, requests 768 dimensions, and returns one L2-normalized vector per input", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ embeddings: [{ values: [0.1, 0.2] }, { values: [0.3, 0.4] }] }),
    );
    const provider = createGeminiEmbeddingProvider({ apiKey: "test-key", fetchImpl });

    const vectors = await provider.embed(["a", "b"]);

    // vector(768) in supabase/migrations/0001_init.sql -- if this ever
    // silently reverted to the API's 3072-dim default, a real deployment's
    // first upsertDocument call would fail with a pgvector dimension
    // mismatch.
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const requestBody = JSON.parse(String(init.body)) as { requests: Array<{ outputDimensionality: number }> };
    expect(requestBody.requests.every((r) => r.outputDimensionality === 768)).toBe(true);

    // Each returned vector is unit length regardless of the raw magnitude
    // the API happened to return.
    for (const vector of vectors) {
      const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
      expect(magnitude).toBeCloseTo(1, 10);
    }

    expect(url).toContain("batchEmbedContents");
    expect(url).not.toContain("test-key");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
  });

  it("throws when the embedding count does not match the input count", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ embeddings: [{ values: [0.1] }] }));
    const provider = createGeminiEmbeddingProvider({ apiKey: "test-key", fetchImpl });

    await expect(provider.embed(["a", "b"])).rejects.toThrow(/2 inputs/);
  });

  it("throws a status-only error without leaking response body text, on a non-ok response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: "internal-trace-id-99999" }, false, 500));
    const provider = createGeminiEmbeddingProvider({ apiKey: "test-key", fetchImpl });

    await expect(provider.embed(["a"])).rejects.toThrow(/500/);
    try {
      await provider.embed(["a"]);
    } catch (error) {
      expect((error as Error).message).not.toContain("internal-trace-id-99999");
    }
  });
});
