import type { EvidenceCatalogItem, RawCandidate } from "@/lib/gemini/types";

export interface ValidatedEvidence {
  supportingEvidenceIds: string[];
  contradictingEvidenceIds: string[];
  unsupportedCitationCount: number;
}

export function validateCandidateEvidence(candidate: RawCandidate, catalog: EvidenceCatalogItem[]): ValidatedEvidence {
  const knownIds = new Set(catalog.map((item) => item.id));

  const supportingEvidenceIds = candidate.supportingEvidenceIds.filter((id) => knownIds.has(id));
  const contradictingEvidenceIds = candidate.contradictingEvidenceIds.filter((id) => knownIds.has(id));

  const unsupportedCitationCount =
    candidate.supportingEvidenceIds.length -
    supportingEvidenceIds.length +
    (candidate.contradictingEvidenceIds.length - contradictingEvidenceIds.length);

  return { supportingEvidenceIds, contradictingEvidenceIds, unsupportedCitationCount };
}
