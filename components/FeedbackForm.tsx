"use client";

import { useState } from "react";

export function FeedbackForm({ incidentId = null }: { incidentId?: string | null }) {
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = message.trim();
    if (trimmed.length === 0) {
      setError("Feedback message can't be empty.");
      setStatus("error");
      return;
    }

    setStatus("submitting");
    setError(null);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incidentId, message: trimmed, rating }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error ?? `Submission failed (HTTP ${response.status}).`);
        setStatus("error");
        return;
      }
      setStatus("done");
      setMessage("");
      setRating(null);
    } catch {
      setError("Network error while submitting feedback.");
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
        Thanks — your feedback was recorded.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <textarea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        maxLength={2000}
        rows={3}
        placeholder="Thoughts on this project or a specific incident..."
        className="w-full resize-none rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(rating === star ? null : star)}
              aria-label={`Rate ${star} star${star > 1 ? "s" : ""}`}
              className={`text-lg leading-none transition-colors ${
                rating !== null && star <= rating ? "text-amber-400" : "text-slate-700 hover:text-slate-500"
              }`}
            >
              ★
            </button>
          ))}
        </div>
        <button
          type="submit"
          disabled={status === "submitting"}
          className="rounded-md bg-sky-500 px-4 py-1.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        >
          {status === "submitting" ? "Sending..." : "Send feedback"}
        </button>
      </div>
      {status === "error" && error ? <p className="text-xs text-red-400">{error}</p> : null}
    </form>
  );
}
