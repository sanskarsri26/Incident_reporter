export interface RankingScoreInputs {
  evidenceCoverage: number;
  retrievalSimilarity: number;
  historicalMatch: number;
  verifierSupport: number;
  contradictionCount: number;
}

const WEIGHTS = {
  evidenceCoverage: 0.35,
  retrievalSimilarity: 0.3,
  historicalMatch: 0.2,
  verifierSupport: 0.15,
};

const CONTRADICTION_PENALTY_PER_ITEM = 0.1;
const MAX_CONTRADICTION_PENALTY = 0.3;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function computeRankingScore(inputs: RankingScoreInputs): number {
  const evidenceCoverage = clamp01(inputs.evidenceCoverage);
  const retrievalSimilarity = clamp01(inputs.retrievalSimilarity);
  const historicalMatch = clamp01(inputs.historicalMatch);
  const verifierSupport = clamp01(inputs.verifierSupport);
  const contradictionPenalty = Math.min(
    MAX_CONTRADICTION_PENALTY,
    CONTRADICTION_PENALTY_PER_ITEM * Math.max(0, inputs.contradictionCount),
  );

  const rawScore =
    WEIGHTS.evidenceCoverage * evidenceCoverage +
    WEIGHTS.retrievalSimilarity * retrievalSimilarity +
    WEIGHTS.historicalMatch * historicalMatch +
    WEIGHTS.verifierSupport * verifierSupport -
    contradictionPenalty;

  return clamp01(rawScore);
}
