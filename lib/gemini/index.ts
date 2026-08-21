import type { EmbeddingProvider, LLMProvider } from "@/lib/gemini/types";
import { createMockEmbeddingProvider, createMockLLMProvider } from "@/lib/gemini/mock-provider";
import { createGeminiEmbeddingProvider, createGeminiLLMProvider } from "@/lib/gemini/gemini-provider";

let cachedLLM: LLMProvider | null = null;
let cachedEmbedding: EmbeddingProvider | null = null;

export function getLLMProvider(): LLMProvider {
  if (cachedLLM) return cachedLLM;

  const apiKey = process.env.GEMINI_API_KEY;
  cachedLLM = apiKey
    ? createGeminiLLMProvider({ apiKey, model: process.env.GEMINI_MODEL })
    : createMockLLMProvider();
  return cachedLLM;
}

export function getEmbeddingProvider(): EmbeddingProvider {
  if (cachedEmbedding) return cachedEmbedding;

  const apiKey = process.env.GEMINI_API_KEY;
  cachedEmbedding = apiKey
    ? createGeminiEmbeddingProvider({ apiKey, model: process.env.GEMINI_EMBED_MODEL })
    : createMockEmbeddingProvider();
  return cachedEmbedding;
}

export function resetProvidersForTests(): void {
  cachedLLM = null;
  cachedEmbedding = null;
}
