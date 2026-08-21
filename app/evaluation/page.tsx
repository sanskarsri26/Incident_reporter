import { readEvaluationReport, type EvaluationReport } from "@/lib/evaluation/report";
import { StatCard } from "@/components/StatCard";
import { PairedBarChart } from "@/components/PairedBarChart";
import { AccuracyBarChart } from "@/components/AccuracyBarChart";

export const dynamic = "force-dynamic";

type EvaluationSummary = EvaluationReport["primary"];

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function ms(value: number): string {
  return `${value.toFixed(0)}ms`;
}

function SummaryComparisonChart({
  title,
  before,
  after,
  beforeLabel,
  afterLabel,
}: {
  title: string;
  before: EvaluationSummary;
  after: EvaluationSummary;
  beforeLabel: string;
  afterLabel: string;
}) {
  const data = [
    { metric: "Top-1 acc.", before: before.top1Accuracy, after: after.top1Accuracy },
    { metric: "Top-3 acc.", before: before.top3Accuracy, after: after.top3Accuracy },
    { metric: "Evidence recall@5", before: before.evidenceRecallAt5, after: after.evidenceRecallAt5 },
  ];

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
      <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
      <PairedBarChart data={data} beforeLabel={beforeLabel} afterLabel={afterLabel} />
    </div>
  );
}

export default function EvaluationPage() {
  const report = readEvaluationReport();

  if (!report) {
    return (
      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold text-slate-50">Evaluation</h1>
        <p className="text-sm text-slate-400">
          No evaluation report is available yet. Generate one by running{" "}
          <code className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-200">npm run evaluate</code> from the
          project root, which freezes a held-out test split and writes{" "}
          <code className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-200">data/evaluation-report.json</code>.
        </p>
      </main>
    );
  }

  const { primary, ablations } = report;

  const topKData = [
    { metric: "Top-1 accuracy", value: primary.top1Accuracy },
    { metric: "Top-3 accuracy", value: primary.top3Accuracy },
    { metric: "Evidence recall@5", value: primary.evidenceRecallAt5 },
  ];

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold text-slate-50">Evaluation</h1>
        <p className="mt-1 text-sm text-slate-400">
          {report.model} · {report.embeddingModel} embeddings · {report.datasetSize} incidents ({report.splitCounts.dev}{" "}
          dev / {report.splitCounts.validation} validation / {report.splitCounts.test} test) · generated{" "}
          {new Date(report.generatedAt).toLocaleString()}
        </p>
      </div>

      {report.notes.length > 0 ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {report.notes[0]}
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Top-1 accuracy" value={pct(primary.top1Accuracy)} hint={`n=${primary.caseCount} test cases`} />
        <StatCard label="Top-3 accuracy" value={pct(primary.top3Accuracy)} />
        <StatCard label="Evidence recall@5" value={pct(primary.evidenceRecallAt5)} />
        <StatCard label="Unsupported evidence rate" value={pct(primary.unsupportedEvidenceRate)} />
        <StatCard label="Latency P50" value={ms(primary.latencyP50Ms)} />
        <StatCard label="Latency P95" value={ms(primary.latencyP95Ms)} />
        <StatCard label="Requests / investigation" value={primary.averageRequestsPerInvestigation.toFixed(1)} />
        <StatCard label="Failure rate" value={pct(primary.failureRate)} />
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <h2 className="text-sm font-semibold text-slate-200">Accuracy vs. evidence recall</h2>
        <AccuracyBarChart data={topKData} />
      </section>

      <section className="flex flex-col gap-6">
        <h2 className="text-lg font-semibold text-slate-100">Ablation experiments</h2>

        <SummaryComparisonChart
          title="A. Retrieval vs. no retrieval"
          before={ablations.a_retrieval_vs_no_retrieval.withoutRetrieval}
          after={ablations.a_retrieval_vs_no_retrieval.withRetrieval}
          beforeLabel="No retrieval"
          afterLabel="With retrieval"
        />

        <SummaryComparisonChart
          title="B. Historical incidents vs. none"
          before={ablations.b_history_vs_no_history.withoutHistory}
          after={ablations.b_history_vs_no_history.withHistory}
          beforeLabel="No history"
          afterLabel="With history"
        />

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
            <h3 className="text-sm font-semibold text-slate-200">C. Ranking score vs. raw model score</h3>
            <p className="mt-1 text-xs text-slate-500">Top-1 accuracy when ranking candidates by each method.</p>
            <PairedBarChart
              data={[
                {
                  metric: "Top-1 accuracy",
                  before: ablations.c_ranking_score_vs_model_score.modelScoreTop1Accuracy,
                  after: ablations.c_ranking_score_vs_model_score.rankingScoreTop1Accuracy,
                },
              ]}
              beforeLabel="Model score"
              afterLabel="Ranking score"
            />
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
            <h3 className="text-sm font-semibold text-slate-200">D. Vector-only vs. hybrid retrieval</h3>
            <p className="mt-1 text-xs text-slate-500">Top-1 runbook match rate for each retrieval strategy.</p>
            <PairedBarChart
              data={[
                {
                  metric: "Runbook match rate",
                  before: ablations.d_vector_only_vs_hybrid_retrieval.vectorOnlyTop1RunbookMatchRate,
                  after: ablations.d_vector_only_vs_hybrid_retrieval.hybridTop1RunbookMatchRate,
                },
              ]}
              beforeLabel="Vector only"
              afterLabel="Hybrid"
            />
          </div>
        </div>
      </section>

      {report.notes.length > 0 ? (
        <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <h2 className="text-sm font-semibold text-slate-200">Notes</h2>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm text-slate-400">
            {report.notes.map((note, index) => (
              <li key={index}>{note}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
