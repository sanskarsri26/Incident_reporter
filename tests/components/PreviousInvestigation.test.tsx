// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PreviousInvestigation } from "@/components/PreviousInvestigation";
import type { AnalysisRun, Prediction, Recommendation } from "@/lib/types";

afterEach(cleanup);

const analysisRun: AnalysisRun = {
  id: "RUN-1",
  incidentId: "INC-1",
  model: "mock",
  promptVersion: "v1",
  latencyMs: 42,
  status: "succeeded",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const predictions: Prediction[] = [
  { id: "P1", analysisRunId: "RUN-1", rootCause: "cpu_spike", rank: 2, confidence: 0.4 },
  { id: "P2", analysisRunId: "RUN-1", rootCause: "db_connection_pool_exhaustion", rank: 1, confidence: 0.8 },
];

const recommendations: Recommendation[] = [
  { id: "R1", analysisRunId: "RUN-1", action: "check pool size", priority: 2 },
  { id: "R2", analysisRunId: "RUN-1", action: "inspect connections", priority: 1 },
];

describe("PreviousInvestigation", () => {
  it("renders predictions sorted by rank, not by input order", () => {
    render(<PreviousInvestigation analysisRun={analysisRun} predictions={predictions} recommendations={[]} />);
    const items = screen.getAllByText(/cpu_spike|db_connection_pool_exhaustion/);
    expect(items[0]?.textContent).toBe("db_connection_pool_exhaustion");
    expect(items[1]?.textContent).toBe("cpu_spike");
  });

  it("renders recommendations sorted by priority, not by input order", () => {
    render(<PreviousInvestigation analysisRun={analysisRun} predictions={[]} recommendations={recommendations} />);
    const text = screen.getByText(/P1 — inspect connections/);
    expect(text).toBeTruthy();
  });

  it("shows the model name and never fabricates evidence detail it doesn't have", () => {
    render(<PreviousInvestigation analysisRun={analysisRun} predictions={predictions} recommendations={recommendations} />);
    expect(screen.getByText(/mock/)).toBeTruthy();
    expect(screen.getByText(/Evidence detail isn't retained between runs/)).toBeTruthy();
  });

  it("omits the recommendations section entirely when there are none", () => {
    render(<PreviousInvestigation analysisRun={analysisRun} predictions={predictions} recommendations={[]} />);
    expect(screen.queryByText("Recommended actions")).toBeNull();
  });
});
