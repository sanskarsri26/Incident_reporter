import type { Severity } from "@/lib/types";

const SEVERITY_STYLES: Record<Severity, string> = {
  sev1: "bg-red-500/15 text-red-300 border-red-500/40",
  sev2: "bg-orange-500/15 text-orange-300 border-orange-500/40",
  sev3: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  sev4: "bg-slate-500/15 text-slate-300 border-slate-500/40",
};

const SEVERITY_LABELS: Record<Severity, string> = {
  sev1: "SEV1",
  sev2: "SEV2",
  sev3: "SEV3",
  sev4: "SEV4",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide ${SEVERITY_STYLES[severity]}`}
    >
      {SEVERITY_LABELS[severity]}
    </span>
  );
}
