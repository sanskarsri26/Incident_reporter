import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getLLMProvider, getEmbeddingProvider, resetProvidersForTests } from "@/lib/gemini/index";

describe("provider factory", () => {
  const originalKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    resetProvidersForTests();
    delete process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    if (originalKey) process.env.GEMINI_API_KEY = originalKey;
    resetProvidersForTests();
  });

  it("defaults to the mock LLM and embedding providers with no GEMINI_API_KEY", () => {
    expect(getLLMProvider().name).toBe("mock");
    expect(getEmbeddingProvider().name).toBe("mock");
  });

  it("uses the real Gemini providers once GEMINI_API_KEY is set", () => {
    process.env.GEMINI_API_KEY = "test-key";
    expect(getLLMProvider().name).toBe("gemini");
    expect(getEmbeddingProvider().name).toBe("gemini");
  });

  it("caches provider instances across calls", () => {
    expect(getLLMProvider()).toBe(getLLMProvider());
    expect(getEmbeddingProvider()).toBe(getEmbeddingProvider());
  });
});
