"use client";

import { useMemo, useState } from "react";
import type { Incident, Severity } from "@/lib/types";
import { SEVERITIES } from "@/lib/types";
import { IncidentTable } from "@/components/IncidentTable";

export function IncidentFilter({ incidents }: { incidents: Incident[] }) {
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState<Severity | "all">("all");

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return incidents
      .filter((incident) => severity === "all" || incident.severity === severity)
      .filter((incident) => !normalizedQuery || incident.title.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }, [incidents, query, severity]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by title..."
          className="w-full rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none sm:max-w-sm"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSeverity("all")}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              severity === "all"
                ? "border-sky-500 bg-sky-500/15 text-sky-300"
                : "border-slate-800 text-slate-400 hover:border-slate-600"
            }`}
          >
            All
          </button>
          {SEVERITIES.map((sev) => (
            <button
              key={sev}
              type="button"
              onClick={() => setSeverity(sev)}
              className={`rounded-full border px-3 py-1 text-xs font-medium uppercase transition-colors ${
                severity === sev
                  ? "border-sky-500 bg-sky-500/15 text-sky-300"
                  : "border-slate-800 text-slate-400 hover:border-slate-600"
              }`}
            >
              {sev}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Showing {filtered.length} of {incidents.length} incidents
      </p>

      <IncidentTable incidents={filtered} />
    </div>
  );
}
