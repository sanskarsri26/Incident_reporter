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
  const response = await fetchImpl(`${GEMINI_API_BASE_URL}/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini generateContent failed: ${response.status} ${await response.text()}`);
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
      const response = await fetchImpl(`${GEMINI_API_BASE_URL}/models/${model}:batchEmbedContents?key=${apiKey}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requests: texts.map((text) => ({
            model: `models/${model}`,
            content: { parts: [{ text }] },
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`Gemini batchEmbedContents failed: ${response.status} ${await response.text()}`);
      }

      const body = (await response.json()) as { embeddings?: Array<{ values?: number[] }> };
      const embeddings = body.embeddings ?? [];
      if (embeddings.length !== texts.length) {
        throw new Error(`Gemini batchEmbedContents returned ${embeddings.length} embeddings for ${texts.length} inputs`);
      }
      return embeddings.map((e) => e.values ?? []);
    },
  };
}
