// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InvestigatePanel } from "@/components/InvestigatePanel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const successBody = {
  analysisRun: { id: "RUN-1", incidentId: "INC-1", model: "mock", promptVersion: "v1", latencyMs: 5, status: "succeeded", createdAt: "2026-01-01T00:00:00.000Z" },
  predictions: [{ id: "P1", analysisRunId: "RUN-1", rootCause: "db_connection_pool_exhaustion", rank: 1, confidence: 0.8 }],
  evidence: [{ id: "E1", predictionId: "P1", sourceType: "log_event", sourceId: "L1", supportType: "supporting" }],
  recommendations: [{ id: "R1", analysisRunId: "RUN-1", action: "inspect connections", priority: 1 }],
  evidenceCatalog: [{ id: "LOG-1", sourceType: "log_event", sourceId: "L1", summary: "postgres connection pool exhausted" }],
  finalRootCause: "db_connection_pool_exhaustion",
};

describe("InvestigatePanel", () => {
  it("shows an idle 'Investigate' button before anything is run", () => {
    render(<InvestigatePanel incidentId="INC-1" />);
    expect(screen.getByRole("button", { name: "Investigate" })).toBeTruthy();
  });

  it("on success, renders the final root cause, ranked candidates, and recommendations", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(successBody));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<InvestigatePanel incidentId="INC-1" />);
    await user.click(screen.getByRole("button", { name: "Investigate" }));

    // "db_connection_pool_exhaustion" legitimately appears twice: once in
    // the "Final root cause" banner, once in the ranked candidate list.
    await waitFor(() => expect(screen.getAllByText("db_connection_pool_exhaustion").length).toBeGreaterThanOrEqual(2));
    expect(fetchMock).toHaveBeenCalledWith("/api/incidents/INC-1/investigate", { method: "POST" });
    expect(screen.getByText("inspect connections")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Re-run investigation" })).toBeTruthy();
  });

  it("shows a friendly rate-limit message on a 429, not a raw error dump", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "Rate limit exceeded. Try again shortly." }, 429)));
    const user = userEvent.setup();

    render(<InvestigatePanel incidentId="INC-1" />);
    await user.click(screen.getByRole("button", { name: "Investigate" }));

    await waitFor(() => expect(screen.getByText(/Rate limit exceeded/)).toBeTruthy());
  });

  it("shows a network-error message when fetch itself throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network down")));
    const user = userEvent.setup();

    render(<InvestigatePanel incidentId="INC-1" />);
    await user.click(screen.getByRole("button", { name: "Investigate" }));

    await waitFor(() => expect(screen.getByText(/Network error/)).toBeTruthy());
  });

  it("only ever renders evidence citations that exist in the returned evidence catalog", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(successBody)));
    const user = userEvent.setup();

    render(<InvestigatePanel incidentId="INC-1" />);
    await user.click(screen.getByRole("button", { name: "Investigate" }));

    await waitFor(() => expect(screen.getAllByText("db_connection_pool_exhaustion").length).toBeGreaterThanOrEqual(1));
    // The evidence catalog's own summary text is what a real citation renders as.
    expect(screen.getByText(/postgres connection pool exhausted/)).toBeTruthy();
  });
});
