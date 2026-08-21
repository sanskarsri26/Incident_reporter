import { describe, it, expect } from "vitest";
import { retrieveByVectorOnly, retrieveHybrid } from "@/lib/retrieval/document-retrieval";
import { createMockEmbeddingProvider } from "@/lib/gemini/mock-provider";
import type { DocumentRecord } from "@/lib/types";

async function embedded(docs: Array<Omit<DocumentRecord, "embedding">>): Promise<DocumentRecord[]> {
  const provider = createMockEmbeddingProvider();
  const vectors = await provider.embed(docs.map((d) => `${d.title} ${d.body}`));
  return docs.map((doc, i) => ({ ...doc, embedding: vectors[i] ?? null }));
}

describe("retrieveByVectorOnly", () => {
  it("ranks the more semantically similar document first", async () => {
    const documents = await embedded([
      { id: "DOC-1", title: "Connection pool runbook", body: "diagnose postgres connection pool exhaustion timeouts", docType: "runbook" },
      { id: "DOC-2", title: "Unrelated runbook", body: "how to reset a forgotten office wifi password", docType: "runbook" },
    ]);
    const provider = createMockEmbeddingProvider();

    const results = await retrieveByVectorOnly("postgres connection pool exhausted", documents, provider, 2);

    expect(results[0]?.document.id).toBe("DOC-1");
    expect(results[0]?.vectorSimilarity).toBeGreaterThan(results[1]?.vectorSimilarity ?? 1);
  });

  it("skips documents with no embedding", async () => {
    const documents: DocumentRecord[] = [{ id: "DOC-1", title: "x", body: "y", docType: "runbook", embedding: null }];
    const provider = createMockEmbeddingProvider();
    const results = await retrieveByVectorOnly("anything", documents, provider, 5);
    expect(results).toEqual([]);
  });

  it("respects topK", async () => {
    const documents = await embedded([
      { id: "DOC-1", title: "a", body: "database timeout", docType: "runbook" },
      { id: "DOC-2", title: "b", body: "database slow query", docType: "runbook" },
      { id: "DOC-3", title: "c", body: "database pool exhaustion", docType: "runbook" },
    ]);
    const provider = createMockEmbeddingProvider();
    const results = await retrieveByVectorOnly("database issue", documents, provider, 2);
    expect(results).toHaveLength(2);
  });
});

describe("retrieveHybrid", () => {
  it("filters by docType when provided", async () => {
    const documents = await embedded([
      { id: "DOC-1", title: "Postgres runbook", body: "connection pool exhaustion", docType: "runbook" },
      { id: "DOC-2", title: "Postgres service description", body: "connection pool exhaustion", docType: "service_description" },
    ]);
    const provider = createMockEmbeddingProvider();
    const results = await retrieveHybrid("connection pool exhaustion", documents, provider, 5, { docType: "runbook" });
    expect(results).toHaveLength(1);
    expect(results[0]?.document.id).toBe("DOC-1");
  });

  it("boosts documents with strong keyword overlap over pure vector similarity", async () => {
    const documents = await embedded([
      { id: "DOC-1", title: "Exact keyword match", body: "connection pool exhaustion connection pool exhaustion", docType: "runbook" },
      { id: "DOC-2", title: "Loosely related", body: "database issues in general", docType: "runbook" },
    ]);
    const provider = createMockEmbeddingProvider();
    const results = await retrieveHybrid("connection pool exhaustion", documents, provider, 2, { vectorWeight: 0.5 });
    expect(results[0]?.document.id).toBe("DOC-1");
    expect(results[0]?.keywordScore).toBeGreaterThan(0);
  });
});
