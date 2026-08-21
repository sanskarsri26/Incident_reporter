import type { IncidentStatus } from "@/lib/types";

const STATUS_STYLES: Record<IncidentStatus, string> = {
  open: "bg-red-500/15 text-red-300 border-red-500/40",
  investigating: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  resolved: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
};

const STATUS_LABELS: Record<IncidentStatus, string> = {
  open: "Open",
  investigating: "Investigating",
  resolved: "Resolved",
};

export function StatusBadge({ status }: { status: IncidentStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
