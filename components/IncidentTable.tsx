import Link from "next/link";
import type { Incident } from "@/lib/types";
import { SeverityBadge } from "@/components/SeverityBadge";
import { StatusBadge } from "@/components/StatusBadge";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function IncidentTable({ incidents }: { incidents: Incident[] }) {
  if (incidents.length === 0) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-8 text-center text-sm text-slate-400">
        No incidents match the current filters.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-800">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-800 bg-slate-900/60 text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="px-4 py-3 font-medium">Title</th>
            <th className="px-4 py-3 font-medium">Severity</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Started</th>
            <th className="px-4 py-3 font-medium">Services</th>
          </tr>
        </thead>
        <tbody>
          {incidents.map((incident) => (
            <tr
              key={incident.id}
              className="border-b border-slate-800/60 last:border-0 hover:bg-slate-900/50"
            >
              <td className="px-4 py-3">
                <Link
                  href={`/incidents/${incident.id}`}
                  className="font-medium text-slate-100 hover:text-sky-400 hover:underline"
                >
                  {incident.title}
                </Link>
                <div className="mt-0.5 font-mono text-xs text-slate-500">{incident.id}</div>
              </td>
              <td className="px-4 py-3">
                <SeverityBadge severity={incident.severity} />
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={incident.status} />
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-slate-300">{formatDate(incident.startedAt)}</td>
              <td className="px-4 py-3 text-slate-400">
                {incident.affectedServices.length > 0 ? incident.affectedServices.join(", ") : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
