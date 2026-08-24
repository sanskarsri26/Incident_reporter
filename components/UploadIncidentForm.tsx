"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SEVERITIES } from "@/lib/types";

export function UploadIncidentForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState<(typeof SEVERITIES)[number]>("sev3");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const logFileRef = useRef<HTMLInputElement>(null);
  const metricsFileRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const logFile = logFileRef.current?.files?.[0];
    if (!logFile) {
      setError("Choose a log file to upload.");
      return;
    }

    const form = new FormData();
    form.set("title", title);
    form.set("severity", severity);
    form.set("logFile", logFile);
    const metricsFile = metricsFileRef.current?.files?.[0];
    if (metricsFile) form.set("metricsFile", metricsFile);

    setSubmitting(true);
    try {
      const response = await fetch("/api/incidents/upload", { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "Upload failed");
        return;
      }
      router.push(`/incidents/${body.incident.id}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="upload-title" className="text-xs font-medium text-slate-300">Title</label>
        <input
          id="upload-title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="upload-severity" className="text-xs font-medium text-slate-300">Severity</label>
        <select
          id="upload-severity"
          value={severity}
          onChange={(e) => setSeverity(e.target.value as (typeof SEVERITIES)[number])}
          className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
        >
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="upload-log-file" className="text-xs font-medium text-slate-300">Log file</label>
        <input id="upload-log-file" ref={logFileRef} type="file" accept=".log,.jsonl,.txt" aria-label="Log file" className="text-sm text-slate-300" />
        <p className="text-xs text-slate-500">JSON Lines: one {"{timestamp, service, level, message}"} object per line.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="upload-metrics-file" className="text-xs font-medium text-slate-300">Metrics file (optional)</label>
        <input id="upload-metrics-file" ref={metricsFileRef} type="file" accept=".log,.jsonl,.txt" aria-label="Metrics file" className="text-sm text-slate-300" />
        <p className="text-xs text-slate-500">JSON Lines: one {"{timestamp, service, metric, value}"} object per line.</p>
      </div>
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 transition-colors hover:bg-sky-400 disabled:opacity-50"
      >
        Upload and investigate
      </button>
    </form>
  );
}
