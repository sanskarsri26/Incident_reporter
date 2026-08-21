import { describe, it, expect } from "vitest";
import { buildActionsPrompt, buildCandidatesPrompt, buildVerifyPrompt } from "@/lib/gemini/prompts";

const evidenceCatalog = [{ id: "LOG-1", sourceType: "log_event" as const, sourceId: "L1", summary: "connection timeout" }];

describe("buildCandidatesPrompt", () => {
  it("includes the incident summary, every evidence id, and the max candidate count", () => {
    const prompt = buildCandidatesPrompt({ incidentSummary: "checkout failing", evidenceCatalog, maxCandidates: 3 });
    expect(prompt).toContain("checkout failing");
    expect(prompt).toContain("[LOG-1] connection timeout");
    expect(prompt).toContain("at most 3 candidates");
  });

  it("omits any closed-label-set instruction when validRootCauses is not provided", () => {
    const prompt = buildCandidatesPrompt({ incidentSummary: "checkout failing", evidenceCatalog, maxCandidates: 3 });
    expect(prompt).not.toContain("MUST be exactly one of");
  });

  it("instructs the model to choose rootCause only from the enumerated set when validRootCauses is provided", () => {
    const prompt = buildCandidatesPrompt({
      incidentSummary: "checkout failing",
      evidenceCatalog,
      maxCandidates: 3,
      validRootCauses: ["db_connection_pool_exhaustion", "cpu_spike"],
    });
    expect(prompt).toContain("MUST be exactly one of these values");
    expect(prompt).toContain("db_connection_pool_exhaustion, cpu_spike");
  });
});

describe("buildVerifyPrompt", () => {
  it("includes the candidate root cause and its cited evidence ids", () => {
    const prompt = buildVerifyPrompt({
      incidentSummary: "checkout failing",
      candidate: { rootCause: "db_connection_pool_exhaustion", score: 0.8, supportingEvidenceIds: ["LOG-1"], contradictingEvidenceIds: [] },
      evidenceCatalog,
    });
    expect(prompt).toContain("db_connection_pool_exhaustion");
    expect(prompt).toContain("LOG-1");
  });

  it("notes when no evidence was cited", () => {
    const prompt = buildVerifyPrompt({
      incidentSummary: "x",
      candidate: { rootCause: "unknown", score: 0, supportingEvidenceIds: [], contradictingEvidenceIds: [] },
      evidenceCatalog,
    });
    expect(prompt).toContain("(none cited)");
  });
});

describe("buildActionsPrompt", () => {
  it("includes the confirmed root cause", () => {
    const prompt = buildActionsPrompt({ incidentSummary: "x", finalRootCause: "db_connection_pool_exhaustion", evidenceCatalog });
    expect(prompt).toContain("db_connection_pool_exhaustion");
  });
});
