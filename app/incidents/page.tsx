import Link from "next/link";
import { getRepository } from "@/lib/db/index";
import { getCurrentUser } from "@/lib/auth/server-component-context";
import { IncidentFilter } from "@/components/IncidentFilter";

export const dynamic = "force-dynamic";

export default async function IncidentsPage() {
  const user = await getCurrentUser();
  const repository = getRepository();
  const incidents = await repository.listIncidents(user?.id ?? null);
  const sharedIncidents = incidents.filter((i) => i.ownerId === null);
  const yourIncidents = incidents.filter((i) => i.ownerId !== null);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-50">Incidents</h1>
          <p className="mt-1 text-sm text-slate-400">
            Search by title or filter by severity.
          </p>
        </div>
        {user ? (
          <Link
            href="/incidents/upload"
            className="shrink-0 rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 transition-colors hover:bg-sky-400"
          >
            Upload an incident
          </Link>
        ) : null}
      </div>

      {user ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-200">Your incidents</h2>
          {yourIncidents.length > 0 ? (
            <IncidentFilter incidents={yourIncidents} />
          ) : (
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-6 text-center text-sm text-slate-400">
              Nothing uploaded yet.{" "}
              <Link href="/incidents/upload" className="text-sky-400 hover:underline">Upload a log file</Link> to get started.
            </div>
          )}
        </section>
      ) : (
        <div className="rounded-lg border border-slate-800 bg-slate-900/20 p-4 text-sm text-slate-400">
          <Link href="/login" className="text-sky-400 hover:underline">Log in</Link> to upload your own incidents.
        </div>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-200">Shared catalog</h2>
        <IncidentFilter incidents={sharedIncidents} />
      </section>
    </main>
  );
}
