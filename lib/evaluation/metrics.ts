import { evidenceTagMatches } from "@/lib/evaluation/evidence-tags";

export interface EvaluationCase {
  incidentId: string;
  faultTruth: string;
  predictedRootCauses: string[];
  expectedEvidenceTags: string[];
  evidenceCatalogSummaries: string[];
  citedEvidenceCount: number;
  unsupportedCitationCount: number;
  latencyMs: number;
  requestCount: number;
  failed: boolean;
}

export interface EvaluationSummary {
  caseCount: number;
  top1Accuracy: number;
  top3Accuracy: number;
  evidenceRecallAt5: number;
  unsupportedEvidenceRate: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
  averageRequestsPerInvestigation: number;
  failureRate: number;
}

function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(sortedValues.length - 1, Math.ceil(p * sortedValues.length) - 1);
  return sortedValues[Math.max(0, index)] ?? 0;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function computeEvaluationSummary(cases: EvaluationCase[]): EvaluationSummary {
  const caseCount = cases.length;
  if (caseCount === 0) {
    return {
      caseCount: 0,
      top1Accuracy: 0,
      top3Accuracy: 0,
      evidenceRecallAt5: 0,
      unsupportedEvidenceRate: 0,
      latencyP50Ms: 0,
      latencyP95Ms: 0,
      averageRequestsPerInvestigation: 0,
      failureRate: 0,
    };
  }

  const top1Correct = cases.filter((c) => !c.failed && c.predictedRootCauses[0] === c.faultTruth).length;
  const top3Correct = cases.filter((c) => !c.failed && c.predictedRootCauses.slice(0, 3).includes(c.faultTruth)).length;

  const recallScores = cases
    .filter((c) => c.expectedEvidenceTags.length > 0)
    .map((c) => {
      const matched = c.expectedEvidenceTags.filter((tag) =>
        c.evidenceCatalogSummaries.some((summary) => evidenceTagMatches(tag, summary)),
      );
      return matched.length / c.expectedEvidenceTags.length;
    });

  const totalCited = cases.reduce((sum, c) => sum + c.citedEvidenceCount, 0);
  const totalUnsupported = cases.reduce((sum, c) => sum + c.unsupportedCitationCount, 0);
  const totalCitationAttempts = totalCited + totalUnsupported;

  const sortedLatencies = cases.map((c) => c.latencyMs).sort((a, b) => a - b);

  return {
    caseCount,
    top1Accuracy: top1Correct / caseCount,
    top3Accuracy: top3Correct / caseCount,
    evidenceRecallAt5: average(recallScores),
    unsupportedEvidenceRate: totalCitationAttempts === 0 ? 0 : totalUnsupported / totalCitationAttempts,
    latencyP50Ms: percentile(sortedLatencies, 0.5),
    latencyP95Ms: percentile(sortedLatencies, 0.95),
    averageRequestsPerInvestigation: average(cases.map((c) => c.requestCount)),
    failureRate: cases.filter((c) => c.failed).length / caseCount,
  };
}
