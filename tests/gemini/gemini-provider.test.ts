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
    expect(url).toContain("key=test-key");
    expect(String(init.body)).toContain("checkout failing");
  });

  it("throws when the API responds with a non-ok status", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: "quota exceeded" }, false, 429));
    const provider = createGeminiLLMProvider({ apiKey: "test-key", fetchImpl });

    await expect(
      provider.generateCandidates({ incidentSummary: "x", evidenceCatalog: [], maxCandidates: 1 }),
    ).rejects.toThrow(/429/);
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
  it("calls batchEmbedContents and returns one vector per input", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ embeddings: [{ values: [0.1, 0.2] }, { values: [0.3, 0.4] }] }),
    );
    const provider = createGeminiEmbeddingProvider({ apiKey: "test-key", fetchImpl });

    const vectors = await provider.embed(["a", "b"]);
    expect(vectors).toEqual([[0.1, 0.2], [0.3, 0.4]]);
    const [url] = fetchImpl.mock.calls[0] as [string];
    expect(url).toContain("batchEmbedContents");
  });

  it("throws when the embedding count does not match the input count", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ embeddings: [{ values: [0.1] }] }));
    const provider = createGeminiEmbeddingProvider({ apiKey: "test-key", fetchImpl });

    await expect(provider.embed(["a", "b"])).rejects.toThrow(/2 inputs/);
  });
});
