import type { TimelineEntry } from "@/lib/investigation/timeline";

const LEVEL_STYLES: Record<string, string> = {
  debug: "text-slate-500",
  info: "text-sky-400",
  warn: "text-amber-400",
  error: "text-red-400",
  fatal: "text-red-300",
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "medium",
  });
}

export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-slate-400">No log or metric events recorded for this incident.</p>;
  }

  return (
    <ol className="flex flex-col gap-2">
      {entries.map((entry, index) => (
        <li
          key={`${entry.kind}-${entry.timestamp}-${index}`}
          className="flex items-start gap-3 rounded-md border border-slate-800/70 bg-slate-900/30 px-3 py-2 text-sm"
        >
          <span className="mt-0.5 shrink-0 font-mono text-xs text-slate-500">{formatTime(entry.timestamp)}</span>
          <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-xs font-medium text-slate-300">
            {entry.service}
          </span>
          {entry.kind === "log" ? (
            <span className="min-w-0 flex-1">
              <span className={`mr-2 font-semibold uppercase ${LEVEL_STYLES[entry.level] ?? "text-slate-300"}`}>
                {entry.level}
              </span>
              <span className="text-slate-200">{entry.template}</span>
              {entry.count > 1 ? <span className="ml-2 text-xs text-slate-500">×{entry.count}</span> : null}
            </span>
          ) : (
            <span className="min-w-0 flex-1">
              <span className="mr-2 font-semibold uppercase text-purple-400">metric</span>
              <span className="text-slate-200">{entry.metric}</span>
              <span className="ml-2 font-mono text-slate-400">= {entry.value}</span>
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
