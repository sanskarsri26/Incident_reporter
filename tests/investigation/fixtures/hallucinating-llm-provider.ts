import type {
  GenerateActionsInput,
  GenerateActionsOutput,
  GenerateCandidatesInput,
  GenerateCandidatesOutput,
  LLMProvider,
  VerifyCandidateInput,
  VerifyCandidateOutput,
} from "@/lib/gemini/types";

export interface HallucinatingLLMProviderOptions {
  /** Extra, non-existent evidence IDs to mix into every candidate's citations. */
  fabricatedIds?: string[];
  /**
   * Extra, non-existent (or uncited) evidence IDs the verifier claims to
   * confirm, beyond whatever the candidate actually cited.
   */
  fabricatedConfirmedIds?: string[];
  /** If true, every candidate cites ONLY fabricated IDs (no real evidence at all). */
  allCitationsFabricated?: boolean;
}

/**
 * A deliberately adversarial LLMProvider for testing the pipeline's
 * evidence-validation guarantees: it fabricates evidence IDs that don't
 * exist in the real catalog handed to it, the way a hallucinating real
 * model could. Used to prove -- not just assert -- that
 * runInvestigation() actually drops fabricated citations rather than
 * trusting them.
 */
export function createHallucinatingLLMProvider(options: HallucinatingLLMProviderOptions = {}): LLMProvider {
  const { fabricatedIds = ["DOC-9999", "LOG-999"], fabricatedConfirmedIds = ["METRIC-8888"], allCitationsFabricated = false } = options;

  return {
    name: "hallucinating-mock",

    async generateCandidates({ evidenceCatalog, maxCandidates }: GenerateCandidatesInput): Promise<GenerateCandidatesOutput> {
      const realIds = evidenceCatalog.slice(0, 2).map((item) => item.id);
      const supportingEvidenceIds = allCitationsFabricated ? [...fabricatedIds] : [...realIds, ...fabricatedIds];

      return {
        candidates: [
          {
            rootCause: "db_connection_pool_exhaustion",
            score: 0.9,
            supportingEvidenceIds: supportingEvidenceIds.slice(0, maxCandidates > 0 ? undefined : 0),
            contradictingEvidenceIds: [],
          },
        ],
      };
    },

    async verifyCandidate({ candidate }: VerifyCandidateInput): Promise<VerifyCandidateOutput> {
      // Adversarial: claims to confirm IDs beyond what was actually cited
      // (validated.supportingEvidenceIds), which a real verifier has no
      // legitimate basis to do.
      return { confirmedEvidenceIds: [...candidate.supportingEvidenceIds, ...fabricatedConfirmedIds] };
    },

    async generateActions(_input: GenerateActionsInput): Promise<GenerateActionsOutput> {
      return { actions: ["investigate further"] };
    },
  };
}
