import { cosineSimilarity } from "@/lib/retrieval/cosine";
import type { EmbeddingProvider } from "@/lib/gemini/types";
import type { DocumentRecord } from "@/lib/types";

/**
 * Known scaling limitation: both retrieval functions below fetch every
 * document via Repository.listDocuments() (a plain `select *`, see
 * lib/db/supabase-repository.ts / memory-repository.ts) and compute cosine
 * similarity in application code -- they never issue a vector similarity
 * query against Postgres/pgvector's own HNSW index (supabase/migrations/
 * 0001_init.sql), even though that index exists and is maintained. This is
 * a reasonable choice at this dataset's scale (11 runbook documents) but
 * would not scale to a large document corpus; a real deployment with many
 * documents should instead push similarity search into Postgres via an
 * RPC function (e.g. `embedding <=> query_embedding` ordered/limited in
 * SQL) rather than loading every row into the Node process.
 */

export interface RetrievedDocument {
  document: DocumentRecord;
  vectorSimilarity: number;
  keywordScore: number;
  combinedScore: number;
}

function tokenize(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((token) => token.length > 2));
}

function keywordOverlap(queryTokens: Set<string>, document: DocumentRecord): number {
  if (queryTokens.size === 0) return 0;
  const docTokens = tokenize(`${document.title} ${document.body}`);
  let matches = 0;
  for (const token of queryTokens) {
    if (docTokens.has(token)) matches += 1;
  }
  return matches / queryTokens.size;
}

export async function retrieveByVectorOnly(
  query: string,
  documents: DocumentRecord[],
  embeddingProvider: EmbeddingProvider,
  topK: number,
): Promise<RetrievedDocument[]> {
  const embeddable = documents.filter((doc): doc is DocumentRecord & { embedding: number[] } => doc.embedding !== null);
  if (embeddable.length === 0) return [];

  const [queryEmbedding] = await embeddingProvider.embed([query]);
  if (!queryEmbedding) return [];

  return embeddable
    .map((document) => {
      const vectorSimilarity = cosineSimilarity(queryEmbedding, document.embedding);
      return { document, vectorSimilarity, keywordScore: 0, combinedScore: vectorSimilarity };
    })
    .sort((a, b) => b.combinedScore - a.combinedScore)
    .slice(0, topK);
}

export interface RetrieveHybridOptions {
  docType?: DocumentRecord["docType"];
  vectorWeight?: number;
}

export async function retrieveHybrid(
  query: string,
  documents: DocumentRecord[],
  embeddingProvider: EmbeddingProvider,
  topK: number,
  options: RetrieveHybridOptions = {},
): Promise<RetrievedDocument[]> {
  const vectorWeight = options.vectorWeight ?? 0.7;
  const keywordWeight = 1 - vectorWeight;

  const filtered = options.docType ? documents.filter((doc) => doc.docType === options.docType) : documents;
  const embeddable = filtered.filter((doc): doc is DocumentRecord & { embedding: number[] } => doc.embedding !== null);
  if (embeddable.length === 0) return [];

  const [queryEmbedding] = await embeddingProvider.embed([query]);
  if (!queryEmbedding) return [];

  const queryTokens = tokenize(query);

  return embeddable
    .map((document) => {
      const vectorSimilarity = cosineSimilarity(queryEmbedding, document.embedding);
      const keywordScore = keywordOverlap(queryTokens, document);
      return {
        document,
        vectorSimilarity,
        keywordScore,
        combinedScore: vectorWeight * vectorSimilarity + keywordWeight * keywordScore,
      };
    })
    .sort((a, b) => b.combinedScore - a.combinedScore)
    .slice(0, topK);
}
