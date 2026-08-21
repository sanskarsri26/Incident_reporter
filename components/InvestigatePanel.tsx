"use client";

import { useState } from "react";
import type { AnalysisRun, Evidence, Prediction, Recommendation } from "@/lib/types";
import type { EvidenceCatalogItem } from "@/lib/gemini/types";

interface InvestigateResponse {
  analysisRun: AnalysisRun;
  predictions: Prediction[];
  evidence: Evidence[];
  recommendations: Recommendation[];
  evidenceCatalog: EvidenceCatalogItem[];
  finalRootCause: string;
}

function catalogKey(sourceType: string, sourceId: string): string {
  return `${sourceType}:${sourceId}`;
}

function EvidenceList({
  evidence,
  catalogByKey,
  supportType,
}: {
  evidence: Evidence[];
  catalogByKey: Map<string, EvidenceCatalogItem>;
  supportType: "supporting" | "contradicting";
}) {
  const filtered = evidence.filter((item) => item.supportType === supportType);
  if (filtered.length === 0) {
    return <p className="text-xs text-slate-500">None cited.</p>;
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {filtered.map((item) => {
        const catalogItem = catalogByKey.get(catalogKey(item.sourceType, item.sourceId));
        return (
          <li key={item.id} className="rounded border border-slate-800/70 bg-slate-950/40 px-2.5 py-1.5 text-xs">
            <span className="mr-1.5 font-mono text-slate-500">{catalogItem?.id ?? item.sourceId}</span>
            <span className="text-slate-300">{catalogItem?.summary ?? "(evidence detail unavailable)"}</span>
            {typeof catalogItem?.similarity === "number" ? (
              <span className="ml-1.5 text-slate-600">({(catalogItem.similarity * 100).toFixed(0)}% match)</span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function InvestigatePanel({ incidentId }: { incidentId: string }) {
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InvestigateResponse | null>(null);

  async function runInvestigation() {
    setStatus("loading");
    setError(null);
    try {
      const response = await fetch(`/api/incidents/${incidentId}/investigate`, { method: "POST" });
      const body = await response.json();

      if (!response.ok) {
        if (response.status === 429) {
          setError("Rate limit exceeded — too many investigations requested in a short window. Wait a moment and try again.");
        } else if (response.status === 502) {
          setError(`Investigation pipeline failed: ${body.error ?? "unknown error from the model provider."}`);
        } else {
          setError(body.error ?? `Investigation request failed (HTTP ${response.status}).`);
        }
        setStatus("error");
        return;
      }

      setResult(body as InvestigateResponse);
      setStatus("done");
    } catch {
      setError("Network error while contacting the investigation pipeline. Check your connection and try again.");
      setStatus("error");
    }
  }

  const catalogByKey = new Map<string, EvidenceCatalogItem>();
  if (result) {
    for (const item of result.evidenceCatalog) {
      catalogByKey.set(catalogKey(item.sourceType, item.sourceId), item);
    }
  }

  const evidenceByPrediction = new Map<string, Evidence[]>();
  if (result) {
    for (const item of result.evidence) {
      const list = evidenceByPrediction.get(item.predictionId) ?? [];
      list.push(item);
      evidenceByPrediction.set(item.predictionId, list);
    }
  }

  const sortedPredictions = result ? [...result.predictions].sort((a, b) => a.rank - b.rank) : [];
  const sortedRecommendations = result
    ? [...result.recommendations].sort((a, b) => a.priority - b.priority)
    : [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={runInvestigation}
          disabled={status === "loading"}
          className="rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        >
          {status === "loading" ? "Investigating..." : status === "done" ? "Re-run investigation" : "Investigate"}
        </button>
        {result ? (
          <span className="text-xs text-slate-500">
            {result.analysisRun.model} · promptVersion {result.analysisRun.promptVersion} · {result.analysisRun.latencyMs}ms
          </span>
        ) : null}
      </div>

      {status === "error" && error ? (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      {status === "loading" ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900/30 px-4 py-6 text-center text-sm text-slate-400">
          Running RAG retrieval, candidate generation, and evidence verification...
        </div>
      ) : null}

      {result ? (
        <div className="flex flex-col gap-6">
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-400">Final root cause</div>
            <div className="mt-1 text-lg font-semibold text-emerald-100">{result.finalRootCause}</div>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-200">Ranked candidates</h3>
            <div className="flex flex-col gap-4">
              {sortedPredictions.map((prediction) => {
                const predictionEvidence = evidenceByPrediction.get(prediction.id) ?? [];
                return (
                  <div
                    key={prediction.id}
                    className={`rounded-lg border p-4 ${
                      prediction.rank === 1 ? "border-emerald-500/40 bg-emerald-500/5" : "border-slate-800 bg-slate-900/30"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-slate-200">
                          {prediction.rank}
                        </span>
                        <span className="font-medium text-slate-100">{prediction.rootCause}</span>
                      </div>
                      <span
                        title="Evidence coverage + retrieval similarity + historical match + verifier agreement, minus contradiction penalty. Not a calibrated probability."
                        className="cursor-help rounded-full border border-slate-700 bg-slate-800/60 px-2.5 py-0.5 text-xs font-medium text-slate-300"
                      >
                        Ranking score: {prediction.confidence.toFixed(2)}
                      </span>
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div>
                        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-400">
                          Supporting evidence
                        </div>
                        <EvidenceList evidence={predictionEvidence} catalogByKey={catalogByKey} supportType="supporting" />
                      </div>
                      <div>
                        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-red-400">
                          Contradicting evidence
                        </div>
                        <EvidenceList evidence={predictionEvidence} catalogByKey={catalogByKey} supportType="contradicting" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {sortedRecommendations.length > 0 ? (
            <div>
              <h3 className="mb-3 text-sm font-semibold text-slate-200">Recommended actions</h3>
              <ol className="flex flex-col gap-2">
                {sortedRecommendations.map((recommendation) => (
                  <li
                    key={recommendation.id}
                    className="flex items-start gap-3 rounded-md border border-slate-800 bg-slate-900/30 px-3 py-2 text-sm"
                  >
                    <span className="mt-0.5 shrink-0 rounded bg-sky-500/15 px-1.5 py-0.5 text-xs font-semibold text-sky-300">
                      P{recommendation.priority}
                    </span>
                    <span className="text-slate-200">{recommendation.action}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
