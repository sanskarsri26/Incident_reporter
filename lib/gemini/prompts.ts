import type { GenerateActionsInput, GenerateCandidatesInput, VerifyCandidateInput } from "@/lib/gemini/types";

function formatEvidence(evidenceCatalog: { id: string; summary: string }[]): string {
  return evidenceCatalog.map((item) => `- [${item.id}] ${item.summary}`).join("\n");
}

export function buildCandidatesPrompt({ incidentSummary, evidenceCatalog, maxCandidates }: GenerateCandidatesInput): string {
  return [
    "You are an SRE investigating a production incident. Given the incident summary and a catalog of evidence items (each with a stable ID), propose the most likely root causes.",
    "",
    "Rules:",
    "- Cite ONLY evidence IDs that appear in the catalog below. Never invent an evidence ID.",
    `- Return at most ${maxCandidates} candidates, ordered most likely first.`,
    "- Respond with strict JSON only, matching this shape:",
    '  {"candidates":[{"rootCause":string,"score":number between 0 and 1,"supportingEvidenceIds":string[],"contradictingEvidenceIds":string[]}]}',
    "",
    "Incident summary:",
    incidentSummary,
    "",
    "Evidence catalog:",
    formatEvidence(evidenceCatalog),
  ].join("\n");
}

export function buildVerifyPrompt({ incidentSummary, candidate, evidenceCatalog }: VerifyCandidateInput): string {
  return [
    "You are independently verifying a proposed root cause for a production incident. Review the evidence catalog and decide which cited evidence IDs are genuinely and directly supportive.",
    "",
    "Rules:",
    "- Only include IDs that appear in the catalog below.",
    "- Respond with strict JSON only, matching this shape:",
    '  {"confirmedEvidenceIds":string[]}',
    "",
    "Incident summary:",
    incidentSummary,
    "",
    "Proposed root cause:",
    candidate.rootCause,
    "",
    "Cited supporting evidence IDs:",
    candidate.supportingEvidenceIds.join(", ") || "(none cited)",
    "",
    "Evidence catalog:",
    formatEvidence(evidenceCatalog),
  ].join("\n");
}

export function buildActionsPrompt({ incidentSummary, finalRootCause, evidenceCatalog }: GenerateActionsInput): string {
  return [
    "You are an SRE recommending remediation steps for a confirmed production incident root cause.",
    "",
    "Rules:",
    "- Return 2 to 4 short, concrete, imperative actions.",
    "- Respond with strict JSON only, matching this shape:",
    '  {"actions":string[]}',
    "",
    "Incident summary:",
    incidentSummary,
    "",
    "Confirmed root cause:",
    finalRootCause,
    "",
    "Supporting evidence catalog:",
    formatEvidence(evidenceCatalog),
  ].join("\n");
}
