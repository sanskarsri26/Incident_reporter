import { describe, it, expect } from "vitest";
import { computeEvaluationSummary, type EvaluationCase } from "@/lib/evaluation/metrics";

function baseCase(overrides: Partial<EvaluationCase> = {}): EvaluationCase {
  return {
    incidentId: "INC-1",
    faultTruth: "db_connection_pool_exhaustion",
    predictedRootCauses: ["db_connection_pool_exhaustion"],
    expectedEvidenceTags: ["connection_timeout"],
    evidenceCatalogSummaries: ["connection timeout waiting for pool"],
    citedEvidenceCount: 2,
    unsupportedCitationCount: 0,
    latencyMs: 100,
    requestCount: 4,
    failed: false,
    ...overrides,
  };
}

describe("computeEvaluationSummary", () => {
  it("returns all-zero defaults for an empty case list", () => {
    const summary = computeEvaluationSummary([]);
    expect(summary.caseCount).toBe(0);
    expect(summary.top1Accuracy).toBe(0);
  });

  it("computes top1 and top3 accuracy correctly", () => {
    const cases: EvaluationCase[] = [
      baseCase({ predictedRootCauses: ["db_connection_pool_exhaustion", "db_slow_query"] }),
      baseCase({ faultTruth: "cpu_spike", predictedRootCauses: ["db_slow_query", "cpu_spike", "memory_leak"] }),
      baseCase({ faultTruth: "memory_leak", predictedRootCauses: ["db_slow_query"] }),
    ];
    const summary = computeEvaluationSummary(cases);
    expect(summary.top1Accuracy).toBeCloseTo(1 / 3, 10);
    expect(summary.top3Accuracy).toBeCloseTo(2 / 3, 10);
  });

  it("treats a failed case as incorrect for both accuracy metrics even if predictions would match", () => {
    const summary = computeEvaluationSummary([baseCase({ failed: true })]);
    expect(summary.top1Accuracy).toBe(0);
    expect(summary.top3Accuracy).toBe(0);
  });

  it("computes evidence recall@5 by matching expected tags against catalog summaries", () => {
    const summary = computeEvaluationSummary([
      baseCase({
        expectedEvidenceTags: ["connection_timeout", "worker_retry"],
        evidenceCatalogSummaries: ["connection timeout waiting for pool"],
      }),
    ]);
    expect(summary.evidenceRecallAt5).toBeCloseTo(0.5, 10);
  });

  it("skips cases with no expected evidence tags from the recall average", () => {
    const summary = computeEvaluationSummary([baseCase({ expectedEvidenceTags: [] })]);
    expect(summary.evidenceRecallAt5).toBe(0);
  });

  it("computes unsupported evidence rate across all cited + unsupported citations", () => {
    const summary = computeEvaluationSummary([
      baseCase({ citedEvidenceCount: 3, unsupportedCitationCount: 1 }),
      baseCase({ citedEvidenceCount: 4, unsupportedCitationCount: 2 }),
    ]);
    expect(summary.unsupportedEvidenceRate).toBeCloseTo(3 / 10, 10);
  });

  it("computes latency percentiles and average request count", () => {
    const cases = [10, 20, 30, 40, 100].map((latencyMs) => baseCase({ latencyMs, requestCount: 5 }));
    const summary = computeEvaluationSummary(cases);
    expect(summary.latencyP50Ms).toBe(30);
    expect(summary.latencyP95Ms).toBe(100);
    expect(summary.averageRequestsPerInvestigation).toBe(5);
  });

  it("computes failure rate", () => {
    const summary = computeEvaluationSummary([baseCase({ failed: true }), baseCase({ failed: false })]);
    expect(summary.failureRate).toBe(0.5);
  });
});
