import Link from "next/link";
import { notFound } from "next/navigation";
import { getRepository } from "@/lib/db/index";
import { getCurrentUser } from "@/lib/auth/server-component-context";
import { getEmbeddingProvider } from "@/lib/gemini/index";
import { buildHistoricalSummary } from "@/lib/investigation/historical-summary";
import { findSimilarIncidents } from "@/lib/retrieval/similar-incidents";
import { SeverityBadge } from "@/components/SeverityBadge";
import { StatusBadge } from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

const TOP_K = 5;

export default async function SimilarIncidentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repository = getRepository();
  const user = await getCurrentUser();
  const incident = await repository.getIncident(id, user?.id ?? null);

  if (!incident) {
    notFound();
  }

  const allIncidents = await repository.listIncidents(user?.id ?? null);
  const candidates = allIncidents.map((other) => ({ incident: other, summary: buildHistoricalSummary(other) }));

  const similar = await findSimilarIncidents(
    buildHistoricalSummary(incident),
    incident.id,
    candidates,
    getEmbeddingProvider(),
    TOP_K,
  );

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
      <div>
        <Link href={`/incidents/${incident.id}`} className="text-xs text-sky-400 hover:underline">
          ← Back to {incident.title}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-50">Similar incidents</h1>
        <p className="mt-1 text-sm text-slate-400">
          Historical incidents ranked by embedding similarity to <span className="text-slate-300">{incident.title}</span>.
        </p>
      </div>

      {similar.length === 0 ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-8 text-center text-sm text-slate-400">
          No similar historical incidents found.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {similar.map(({ incident: match, similarity }) => (
            <Link
              key={match.id}
              href={`/incidents/${match.id}`}
              className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900/30 p-4 transition-colors hover:border-sky-500/50 hover:bg-slate-900/60 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-100">{match.title}</span>
                  <SeverityBadge severity={match.severity} />
                  <StatusBadge status={match.status} />
                </div>
                <p className="mt-1 text-xs text-slate-500">{match.rootCauseTruth ?? "No known ground truth"}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <div className="text-right">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Similarity</div>
                  <div className="text-lg font-semibold text-sky-300">{(similarity * 100).toFixed(1)}%</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
