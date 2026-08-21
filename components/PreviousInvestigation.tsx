import type { AnalysisRun, Prediction, Recommendation } from "@/lib/types";

interface PreviousInvestigationProps {
  analysisRun: AnalysisRun;
  predictions: Prediction[];
  recommendations: Recommendation[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Read-only summary of the most recent prior investigation, shown before
 * the user re-runs the pipeline. Previously, investigation results were
 * written (saveAnalysisRun/savePredictions/saveRecommendations) but never
 * read back anywhere -- clicking "Investigate" always re-ran the full
 * pipeline from scratch, silently discarding whatever a past run already
 * found. This does not attempt to reconstruct full evidence citations for
 * a past run: EvidenceCatalogItem summaries (the human-readable
 * descriptions) are never persisted, only sourceType/sourceId references,
 * so a faithful evidence reconstruction isn't possible from storage alone
 * -- this intentionally stays a lightweight summary, not a full history
 * browser.
 */
export function PreviousInvestigation({ analysisRun, predictions, recommendations }: PreviousInvestigationProps) {
  const sortedPredictions = [...predictions].sort((a, b) => a.rank - b.rank);
  const sortedRecommendations = [...recommendations].sort((a, b) => a.priority - b.priority);

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Previous investigation
        </h3>
        <span className="text-xs text-slate-500">
          {analysisRun.model} · {formatDate(analysisRun.createdAt)}
        </span>
      </div>

      {sortedPredictions.length > 0 ? (
        <ol className="flex flex-col gap-1.5">
          {sortedPredictions.map((prediction) => (
            <li key={prediction.id} className="flex items-center gap-2 text-sm">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-slate-200">
                {prediction.rank}
              </span>
              <span className="text-slate-200">{prediction.rootCause}</span>
              <span className="text-xs text-slate-500">(score {prediction.confidence.toFixed(2)})</span>
            </li>
          ))}
        </ol>
      ) : null}

      {sortedRecommendations.length > 0 ? (
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Recommended actions
          </div>
          <ul className="flex flex-col gap-1">
            {sortedRecommendations.map((recommendation) => (
              <li key={recommendation.id} className="text-xs text-slate-400">
                P{recommendation.priority} — {recommendation.action}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-xs text-slate-600">
        Evidence detail isn&apos;t retained between runs — re-investigate below for full,
        evidence-linked results.
      </p>
    </div>
  );
}
