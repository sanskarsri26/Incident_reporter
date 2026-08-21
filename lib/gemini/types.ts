import type { EvidenceSourceType } from "@/lib/types";

export interface EvidenceCatalogItem {
  id: string;
  sourceType: EvidenceSourceType;
  sourceId: string;
  summary: string;
  similarity?: number;
}

export interface RawCandidate {
  rootCause: string;
  score: number;
  supportingEvidenceIds: string[];
  contradictingEvidenceIds: string[];
}

export interface GenerateCandidatesInput {
  incidentSummary: string;
  evidenceCatalog: EvidenceCatalogItem[];
  maxCandidates: number;
}

export interface GenerateCandidatesOutput {
  candidates: RawCandidate[];
}

export interface VerifyCandidateInput {
  incidentSummary: string;
  candidate: RawCandidate;
  evidenceCatalog: EvidenceCatalogItem[];
}

export interface VerifyCandidateOutput {
  confirmedEvidenceIds: string[];
}

export interface GenerateActionsInput {
  incidentSummary: string;
  finalRootCause: string;
  evidenceCatalog: EvidenceCatalogItem[];
}

export interface GenerateActionsOutput {
  actions: string[];
}

export interface LLMProvider {
  readonly name: string;
  generateCandidates(input: GenerateCandidatesInput): Promise<GenerateCandidatesOutput>;
  verifyCandidate(input: VerifyCandidateInput): Promise<VerifyCandidateOutput>;
  generateActions(input: GenerateActionsInput): Promise<GenerateActionsOutput>;
}

export interface EmbeddingProvider {
  readonly name: string;
  embed(texts: string[]): Promise<number[][]>;
}
