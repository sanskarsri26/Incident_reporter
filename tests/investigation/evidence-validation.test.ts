import { describe, it, expect } from "vitest";
import { validateCandidateEvidence } from "@/lib/investigation/evidence-validation";
import type { EvidenceCatalogItem } from "@/lib/gemini/types";

const catalog: EvidenceCatalogItem[] = [
  { id: "LOG-1", sourceType: "log_event", sourceId: "L1", summary: "timeout" },
  { id: "METRIC-1", sourceType: "metric_event", sourceId: "M1", summary: "connections at limit" },
];

describe("validateCandidateEvidence", () => {
  it("passes through evidence ids that exist in the catalog", () => {
    const result = validateCandidateEvidence(
      { rootCause: "x", score: 0.5, supportingEvidenceIds: ["LOG-1", "METRIC-1"], contradictingEvidenceIds: [] },
      catalog,
    );
    expect(result.supportingEvidenceIds).toEqual(["LOG-1", "METRIC-1"]);
    expect(result.unsupportedCitationCount).toBe(0);
  });

  it("drops supporting evidence ids that do not exist in the catalog and counts them as unsupported", () => {
    const result = validateCandidateEvidence(
      { rootCause: "x", score: 0.5, supportingEvidenceIds: ["LOG-1", "LOG-999"], contradictingEvidenceIds: [] },
      catalog,
    );
    expect(result.supportingEvidenceIds).toEqual(["LOG-1"]);
    expect(result.unsupportedCitationCount).toBe(1);
  });

  it("drops contradicting evidence ids that do not exist and counts them as unsupported too", () => {
    const result = validateCandidateEvidence(
      { rootCause: "x", score: 0.5, supportingEvidenceIds: [], contradictingEvidenceIds: ["DOC-42"] },
      catalog,
    );
    expect(result.contradictingEvidenceIds).toEqual([]);
    expect(result.unsupportedCitationCount).toBe(1);
  });

  it("returns zero unsupported citations for a candidate that cites nothing", () => {
    const result = validateCandidateEvidence({ rootCause: "x", score: 0, supportingEvidenceIds: [], contradictingEvidenceIds: [] }, catalog);
    expect(result.unsupportedCitationCount).toBe(0);
  });
});
