import { getRepository } from "@/lib/db/index";
import { IncidentFilter } from "@/components/IncidentFilter";

export const dynamic = "force-dynamic";

export default async function IncidentsPage() {
  const repository = getRepository();
  const incidents = await repository.listIncidents();

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold text-slate-50">Incidents</h1>
        <p className="mt-1 text-sm text-slate-400">
          All incidents in the simulated dataset. Search by title or filter by severity.
        </p>
      </div>

      <IncidentFilter incidents={incidents} />
    </main>
  );
}
