import Link from "next/link";
import { getRepository } from "@/lib/db/index";
import { getCurrentUser } from "@/lib/auth/server-component-context";
import { readEvaluationReport } from "@/lib/evaluation/report";
import { SEVERITIES } from "@/lib/types";
import { IncidentTable } from "@/components/IncidentTable";
import { StatCard } from "@/components/StatCard";
import { SeverityChart } from "@/components/SeverityChart";

export const dynamic = "force-dynamic";

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export default async function HomePage() {
  const repository = getRepository();
  const user = await getCurrentUser();
  const incidents = await repository.listIncidents(user?.id ?? null);
  const report = readEvaluationReport();

  const severityCounts = SEVERITIES.map((severity) => ({
    severity,
    count: incidents.filter((incident) => incident.severity === severity).length,
  }));

  const openCount = incidents.filter((incident) => incident.status !== "resolved").length;

  const recentIncidents = [...incidents]
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, 8);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold text-slate-50">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-400">
          AI-assisted root-cause investigation for a simulated production environment.
        </p>
      </div>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total incidents" value={String(incidents.length)} />
        <StatCard label="Open / investigating" value={String(openCount)} />
        <StatCard
          label="Top-1 accuracy"
          value={report ? formatPercent(report.primary.top1Accuracy) : "—"}
          hint={report ? `n=${report.primary.caseCount} held-out cases` : "No evaluation report yet"}
        />
        <StatCard
          label="Evidence recall@5"
          value={report ? formatPercent(report.primary.evidenceRecallAt5) : "—"}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-200">Severity breakdown</h2>
          <SeverityChart data={severityCounts} />
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">Evaluation snapshot</h2>
            <Link href="/evaluation" className="text-xs text-sky-400 hover:underline">
              Full report →
            </Link>
          </div>
          {report ? (
            <dl className="mt-3 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-slate-400">Top-1 accuracy</dt>
                <dd className="font-medium text-slate-100">{formatPercent(report.primary.top1Accuracy)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-400">Top-3 accuracy</dt>
                <dd className="font-medium text-slate-100">{formatPercent(report.primary.top3Accuracy)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-400">Evidence recall@5</dt>
                <dd className="font-medium text-slate-100">{formatPercent(report.primary.evidenceRecallAt5)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-400">Failure rate</dt>
                <dd className="font-medium text-slate-100">{formatPercent(report.primary.failureRate)}</dd>
              </div>
              <p className="border-t border-slate-800 pt-3 text-xs text-slate-500">
                Model: {report.model} · {report.datasetSize} incidents in dataset
              </p>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-slate-400">
              No evaluation report yet. Run <code className="text-slate-300">npm run evaluate</code> to generate one.
            </p>
          )}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">Recent incidents</h2>
          <Link href="/incidents" className="text-xs text-sky-400 hover:underline">
            View all →
          </Link>
        </div>
        <IncidentTable incidents={recentIncidents} />
      </section>
    </main>
  );
}
