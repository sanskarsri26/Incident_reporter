import { cosineSimilarity } from "@/lib/retrieval/cosine";
import type { EmbeddingProvider } from "@/lib/gemini/types";
import type { Incident } from "@/lib/types";

export interface SimilarIncident {
  incident: Incident;
  similarity: number;
}

export async function findSimilarIncidents(
  targetSummary: string,
  targetIncidentId: string,
  candidates: Array<{ incident: Incident; summary: string }>,
  embeddingProvider: EmbeddingProvider,
  topK: number,
): Promise<SimilarIncident[]> {
  const others = candidates.filter((c) => c.incident.id !== targetIncidentId);
  if (others.length === 0) return [];

  const texts = [targetSummary, ...others.map((c) => c.summary)];
  const vectors = await embeddingProvider.embed(texts);
  const targetVector = vectors[0];
  if (!targetVector) return [];

  return others
    .map((candidate, index) => ({
      incident: candidate.incident,
      similarity: cosineSimilarity(targetVector, vectors[index + 1] ?? []),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}
