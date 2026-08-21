import Link from "next/link";
import { notFound } from "next/navigation";
import { getRepository } from "@/lib/db/index";
import { buildTimeline } from "@/lib/investigation/timeline";
import { SeverityBadge } from "@/components/SeverityBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { Timeline } from "@/components/Timeline";
import { InvestigatePanel } from "@/components/InvestigatePanel";

export const dynamic = "force-dynamic";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default async function IncidentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repository = getRepository();
  const incident = await repository.getIncident(id);

  if (!incident) {
    notFound();
  }

  const [logEvents, metricEvents] = await Promise.all([
    repository.listLogEvents(incident.id),
    repository.listMetricEvents(incident.id),
  ]);
  const timeline = buildTimeline(logEvents, metricEvents);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
      <div>
        <Link href="/incidents" className="text-xs text-sky-400 hover:underline">
          ← Back to incidents
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-50">{incident.title}</h1>
            <p className="mt-1 font-mono text-xs text-slate-500">{incident.id}</p>
          </div>
          <div className="flex items-center gap-2">
            <SeverityBadge severity={incident.severity} />
            <StatusBadge status={incident.status} />
          </div>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-400">Started</div>
          <div className="mt-1 text-sm text-slate-100">{formatDate(incident.startedAt)}</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-400">Resolved</div>
          <div className="mt-1 text-sm text-slate-100">{formatDate(incident.resolvedAt)}</div>
        </div>
        <div className="col-span-2 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-400">Affected services</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {incident.affectedServices.length > 0 ? (
              incident.affectedServices.map((service) => (
                <span key={service} className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-200">
                  {service}
                </span>
              ))
            ) : (
              <span className="text-sm text-slate-500">None recorded</span>
            )}
          </div>
        </div>
      </section>

      <section className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/20 px-4 py-3">
        <p className="text-xs text-slate-500">
          Dataset ground truth for this incident (for demo/eval purposes — never included in this
          incident&apos;s own investigation prompt). Historical incidents referenced during
          retrieval are represented to the model by title only, never by their confirmed root
          cause.
        </p>
        <p className="text-sm text-slate-300">{incident.rootCauseTruth}</p>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">Investigation</h2>
          <Link href={`/incidents/${incident.id}/similar`} className="text-xs text-sky-400 hover:underline">
            View similar incidents →
          </Link>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/20 p-5">
          <InvestigatePanel incidentId={incident.id} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-200">
          Timeline <span className="font-normal text-slate-500">({timeline.length} events)</span>
        </h2>
        <div className="max-h-[32rem] overflow-y-auto rounded-lg border border-slate-800 bg-slate-900/20 p-3">
          <Timeline entries={timeline} />
        </div>
      </section>
    </main>
  );
}
