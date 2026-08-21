import { cosineSimilarity } from "@/lib/retrieval/cosine";
import type { EmbeddingProvider } from "@/lib/gemini/types";
import type { Incident } from "@/lib/types";

export interface SimilarIncident {
  incident: Incident;
  similarity: number;
}

// Content-addressed by the exact summary text, so a cache hit is always
// correct: if an incident's summary ever changed, that's simply a new key
// (a miss), never a stale read. Incident summaries in this app are
// immutable once generated (resolved incidents in a static dataset), so in
// practice every entry is a permanent hit after the first computation.
//
// This exists because app/incidents/[id]/similar/page.tsx (a Server
// Component, force-dynamic, not rate-limited the way the equivalent API
// route is) re-embeds every historical incident's summary on every single
// page view -- without this cache, refreshing that page in a loop would
// burn one embedding call per historical incident, per view, indefinitely.
const embeddingCache = new Map<string, number[]>();

export function resetSimilarIncidentsCacheForTests(): void {
  embeddingCache.clear();
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

  const allTexts = [targetSummary, ...others.map((c) => c.summary)];
  const uncachedTexts = [...new Set(allTexts.filter((text) => !embeddingCache.has(text)))];

  if (uncachedTexts.length > 0) {
    const freshVectors = await embeddingProvider.embed(uncachedTexts);
    uncachedTexts.forEach((text, index) => {
      const vector = freshVectors[index];
      if (vector) embeddingCache.set(text, vector);
    });
  }

  const targetVector = embeddingCache.get(targetSummary);
  if (!targetVector) return [];

  return others
    .map((candidate) => ({
      incident: candidate.incident,
      similarity: cosineSimilarity(targetVector, embeddingCache.get(candidate.summary) ?? []),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}
