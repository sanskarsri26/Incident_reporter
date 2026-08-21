import { describe, it, expect } from "vitest";
import { cosineSimilarity } from "@/lib/retrieval/cosine";

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 10);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 10);
  });

  it("returns -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 10);
  });

  it("returns 0 when either vector is all zeros", () => {
    expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
  });

  it("clamps to exactly 1 even when float accumulation would otherwise overshoot it", () => {
    // A long, non-trivial vector compared to itself is exactly where float
    // accumulation error historically pushed the raw result to
    // 1.0000000000000002 -- callers render this as a percentage, where
    // anything above 100% reads as a bug.
    const vector = Array.from({ length: 768 }, (_, i) => Math.sin(i) * 3.14159);
    expect(cosineSimilarity(vector, vector)).toBe(1);
  });
});
