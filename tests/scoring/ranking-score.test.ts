import { describe, it, expect } from "vitest";
import { computeRankingScore } from "@/lib/scoring/ranking-score";

const perfectInputs = {
  evidenceCoverage: 1,
  retrievalSimilarity: 1,
  historicalMatch: 1,
  verifierSupport: 1,
  contradictionCount: 0,
};

describe("computeRankingScore", () => {
  it("returns 1 when every signal is perfect and there are no contradictions", () => {
    expect(computeRankingScore(perfectInputs)).toBeCloseTo(1, 10);
  });

  it("returns 0 when every signal is zero", () => {
    expect(computeRankingScore({ evidenceCoverage: 0, retrievalSimilarity: 0, historicalMatch: 0, verifierSupport: 0, contradictionCount: 0 })).toBe(0);
  });

  it("weights evidenceCoverage at 0.35", () => {
    const score = computeRankingScore({ ...perfectInputs, retrievalSimilarity: 0, historicalMatch: 0, verifierSupport: 0 });
    expect(score).toBeCloseTo(0.35, 10);
  });

  it("weights retrievalSimilarity at 0.30", () => {
    const score = computeRankingScore({ ...perfectInputs, evidenceCoverage: 0, historicalMatch: 0, verifierSupport: 0 });
    expect(score).toBeCloseTo(0.3, 10);
  });

  it("weights historicalMatch at 0.20", () => {
    const score = computeRankingScore({ ...perfectInputs, evidenceCoverage: 0, retrievalSimilarity: 0, verifierSupport: 0 });
    expect(score).toBeCloseTo(0.2, 10);
  });

  it("weights verifierSupport at 0.15", () => {
    const score = computeRankingScore({ ...perfectInputs, evidenceCoverage: 0, retrievalSimilarity: 0, historicalMatch: 0 });
    expect(score).toBeCloseTo(0.15, 10);
  });

  it("subtracts 0.1 per contradiction, capped at 0.3", () => {
    expect(computeRankingScore({ ...perfectInputs, contradictionCount: 1 })).toBeCloseTo(0.9, 10);
    expect(computeRankingScore({ ...perfectInputs, contradictionCount: 3 })).toBeCloseTo(0.7, 10);
    expect(computeRankingScore({ ...perfectInputs, contradictionCount: 10 })).toBeCloseTo(0.7, 10);
  });

  it("clamps the final score to [0, 1] even with out-of-range inputs", () => {
    expect(computeRankingScore({ evidenceCoverage: 2, retrievalSimilarity: 2, historicalMatch: 2, verifierSupport: 2, contradictionCount: 0 })).toBeCloseTo(1, 10);
    expect(computeRankingScore({ evidenceCoverage: -1, retrievalSimilarity: -1, historicalMatch: -1, verifierSupport: -1, contradictionCount: 0 })).toBe(0);
  });
});
