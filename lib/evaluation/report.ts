import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const evaluationSummarySchema = z.object({
  caseCount: z.number(),
  top1Accuracy: z.number(),
  top3Accuracy: z.number(),
  evidenceRecallAt5: z.number(),
  unsupportedEvidenceRate: z.number(),
  latencyP50Ms: z.number(),
  latencyP95Ms: z.number(),
  averageRequestsPerInvestigation: z.number(),
  failureRate: z.number(),
});

const evaluationReportSchema = z.object({
  generatedAt: z.string(),
  model: z.string(),
  embeddingModel: z.string(),
  datasetSize: z.number(),
  splitCounts: z.object({ dev: z.number(), validation: z.number(), test: z.number() }),
  primary: evaluationSummarySchema,
  ablations: z.object({
    a_retrieval_vs_no_retrieval: z.object({
      withRetrieval: evaluationSummarySchema,
      withoutRetrieval: evaluationSummarySchema,
    }),
    b_history_vs_no_history: z.object({
      withHistory: evaluationSummarySchema,
      withoutHistory: evaluationSummarySchema,
    }),
    c_ranking_score_vs_model_score: z.object({
      rankingScoreTop1Accuracy: z.number(),
      modelScoreTop1Accuracy: z.number(),
    }),
    d_vector_only_vs_hybrid_retrieval: z.object({
      vectorOnlyTop1RunbookMatchRate: z.number(),
      hybridTop1RunbookMatchRate: z.number(),
    }),
  }),
  notes: z.array(z.string()),
});

export type EvaluationReport = z.infer<typeof evaluationReportSchema>;

const DEFAULT_REPORT_PATH = path.resolve(process.cwd(), "data", "evaluation-report.json");

export function readEvaluationReport(reportPath: string = DEFAULT_REPORT_PATH): EvaluationReport | null {
  try {
    const raw = readFileSync(reportPath, "utf-8");
    return evaluationReportSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}
