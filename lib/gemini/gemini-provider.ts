import { z } from "zod";
import { buildActionsPrompt, buildCandidatesPrompt, buildVerifyPrompt } from "@/lib/gemini/prompts";
import type {
  EmbeddingProvider,
  GenerateActionsInput,
  GenerateActionsOutput,
  GenerateCandidatesInput,
  GenerateCandidatesOutput,
  LLMProvider,
  VerifyCandidateInput,
  VerifyCandidateOutput,
} from "@/lib/gemini/types";

const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

type FetchFn = typeof fetch;

const rawCandidateSchema = z.object({
  rootCause: z.string(),
  score: z.number().min(0).max(1),
  supportingEvidenceIds: z.array(z.string()),
  contradictingEvidenceIds: z.array(z.string()),
});

const candidatesResponseSchema = z.object({ candidates: z.array(rawCandidateSchema) });
const verifyResponseSchema = z.object({ confirmedEvidenceIds: z.array(z.string()) });
const actionsResponseSchema = z.object({ actions: z.array(z.string()) });

async function callGenerateContent(
  fetchImpl: FetchFn,
  apiKey: string,
  model: string,
  prompt: string,
): Promise<string> {
  const response = await fetchImpl(`${GEMINI_API_BASE_URL}/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });

  if (!response.ok) {
    // Full response body (which can include upstream error detail we don't
    // want reaching the browser) is logged server-side only. The thrown
    // message keeps the status code -- callers like
    // app/api/incidents/[id]/investigate/route.ts's isUpstreamQuotaError()
    // regex-match on it to detect a 429 -- but never the body text.
    console.error(`Gemini generateContent failed: ${response.status} ${await response.text()}`);
    throw new Error(`Gemini generateContent failed with status ${response.status}`);
  }

  const body = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini generateContent returned no text");
  }
  return text;
}

export interface GeminiLLMProviderOptions {
  apiKey: string;
  model?: string;
  fetchImpl?: FetchFn;
}

export function createGeminiLLMProvider({
  apiKey,
  model = "gemini-2.0-flash",
  fetchImpl = fetch,
}: GeminiLLMProviderOptions): LLMProvider {
  return {
    name: "gemini",

    async generateCandidates(input: GenerateCandidatesInput): Promise<GenerateCandidatesOutput> {
      const text = await callGenerateContent(fetchImpl, apiKey, model, buildCandidatesPrompt(input));
      return candidatesResponseSchema.parse(JSON.parse(text));
    },

    async verifyCandidate(input: VerifyCandidateInput): Promise<VerifyCandidateOutput> {
      const text = await callGenerateContent(fetchImpl, apiKey, model, buildVerifyPrompt(input));
      return verifyResponseSchema.parse(JSON.parse(text));
    },

    async generateActions(input: GenerateActionsInput): Promise<GenerateActionsOutput> {
      const text = await callGenerateContent(fetchImpl, apiKey, model, buildActionsPrompt(input));
      return actionsResponseSchema.parse(JSON.parse(text));
    },
  };
}

// Must match the `vector(768)` column declared in
// supabase/migrations/0001_init.sql. gemini-embedding-001 defaults to 3072
// dimensions if outputDimensionality is unspecified -- without this, a
// deployment with both GEMINI_API_KEY and SUPABASE_URL set would hit a
// pgvector dimension-mismatch error on the first real upsertDocument call.
const EMBEDDING_DIMENSIONS = 768;

function l2Normalize(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (magnitude === 0) return vector;
  return vector.map((v) => v / magnitude);
}

export interface GeminiEmbeddingProviderOptions {
  apiKey: string;
  model?: string;
  fetchImpl?: FetchFn;
}

export function createGeminiEmbeddingProvider({
  apiKey,
  model = "gemini-embedding-001",
  fetchImpl = fetch,
}: GeminiEmbeddingProviderOptions): EmbeddingProvider {
  return {
    name: "gemini",

    async embed(texts: string[]): Promise<number[][]> {
      const response = await fetchImpl(`${GEMINI_API_BASE_URL}/models/${model}:batchEmbedContents`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          requests: texts.map((text) => ({
            model: `models/${model}`,
            content: { parts: [{ text }] },
            outputDimensionality: EMBEDDING_DIMENSIONS,
          })),
        }),
      });

      if (!response.ok) {
        console.error(`Gemini batchEmbedContents failed: ${response.status} ${await response.text()}`);
        throw new Error(`Gemini batchEmbedContents failed with status ${response.status}`);
      }

      const body = (await response.json()) as { embeddings?: Array<{ values?: number[] }> };
      const embeddings = body.embeddings ?? [];
      if (embeddings.length !== texts.length) {
        throw new Error(`Gemini batchEmbedContents returned ${embeddings.length} embeddings for ${texts.length} inputs`);
      }
      // Only the API's default (3072-dim, unspecified outputDimensionality)
      // response is documented as pre-normalized to unit length; requesting
      // a non-default dimensionality like 768 may not be. Re-normalizing an
      // already-unit vector is a no-op, so this is safe either way and
      // keeps cosine similarity meaningful downstream.
      return embeddings.map((e) => l2Normalize(e.values ?? []));
    },
  };
}
