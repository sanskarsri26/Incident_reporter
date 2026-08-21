import type {
  EmbeddingProvider,
  GenerateActionsInput,
  GenerateActionsOutput,
  GenerateCandidatesInput,
  GenerateCandidatesOutput,
  LLMProvider,
  VerifyCandidateInput,
  VerifyCandidateOutput,
} from "@/lib/gemini/types";

export const FAULT_KEYWORDS: Record<string, string[]> = {
  db_connection_pool_exhaustion: ["connection pool", "pool limit", "connection timeout", "pool exhaust"],
  db_slow_query: ["slow query", "query duration", "query latency"],
  memory_leak: ["memory leak", "oom", "out of memory", "memory climb", "restart after memory"],
  dependency_timeout: ["upstream timeout", "dependency timeout", "downstream timeout"],
  cpu_spike: ["cpu spike", "cpu saturat", "cpu at 100", "cpu_percent"],
  redis_unavailable: ["redis unavailable", "cache connection error", "cache miss storm"],
  worker_backlog: ["queue growth", "worker backlog", "processing delay", "queue_depth"],
  bad_config_deploy: ["config deployed", "bad configuration", "config_deployed", "errors began right after"],
};

export const FAULT_ACTIONS: Record<string, string[]> = {
  db_connection_pool_exhaustion: [
    "inspect active and idle database connections",
    "check for long-running transactions",
    "review connection pool size and release behavior",
  ],
  db_slow_query: ["identify the slow query plan", "check for missing indexes", "review recent schema or data volume changes"],
  memory_leak: ["capture a heap snapshot", "check for unbounded caches or listeners", "roll back the most recent deploy"],
  dependency_timeout: ["check the health of the downstream dependency", "review timeout and retry configuration", "add a circuit breaker if missing"],
  cpu_spike: ["profile the hot code path", "check for a runaway loop or batch job", "consider horizontal scaling"],
  redis_unavailable: ["check Redis process and network connectivity", "verify Redis memory and eviction policy", "confirm graceful degradation to the database"],
  worker_backlog: ["scale up worker concurrency", "check for a stuck or slow consumer", "inspect dead-letter queue growth"],
  bad_config_deploy: ["diff the last deployed configuration", "roll back to the previous known-good config", "add config validation to the deploy pipeline"],
};

const GENERIC_ACTIONS = ["review recent deploys", "check service health dashboards", "escalate to the owning team"];

function matchScore(summary: string, keywords: string[]): number {
  const lower = summary.toLowerCase();
  return keywords.reduce((count, keyword) => (lower.includes(keyword) ? count + 1 : count), 0);
}

export function createMockLLMProvider(): LLMProvider {
  return {
    name: "mock",

    async generateCandidates({ evidenceCatalog, maxCandidates }: GenerateCandidatesInput): Promise<GenerateCandidatesOutput> {
      const ranked = Object.entries(FAULT_KEYWORDS)
        .map(([fault, keywords]) => {
          const matchedItems = evidenceCatalog.filter((item) => matchScore(item.summary, keywords) > 0);
          return { fault, matchedItems };
        })
        .filter((entry) => entry.matchedItems.length > 0)
        .sort((a, b) => b.matchedItems.length - a.matchedItems.length);

      const top = ranked.slice(0, Math.max(1, maxCandidates));
      const maxMatches = top[0]?.matchedItems.length ?? 1;

      const candidates = top.map(({ fault, matchedItems }) => ({
        rootCause: fault,
        score: Math.min(1, matchedItems.length / maxMatches),
        supportingEvidenceIds: matchedItems.slice(0, 5).map((item) => item.id),
        contradictingEvidenceIds: [],
      }));

      if (candidates.length === 0) {
        return {
          candidates: [
            {
              rootCause: "unknown",
              score: 0,
              supportingEvidenceIds: [],
              contradictingEvidenceIds: [],
            },
          ],
        };
      }

      return { candidates };
    },

    async verifyCandidate({ candidate, evidenceCatalog }: VerifyCandidateInput): Promise<VerifyCandidateOutput> {
      const hardEvidenceIds = new Set(
        evidenceCatalog
          .filter((item) => item.sourceType === "log_event" || item.sourceType === "metric_event")
          .map((item) => item.id),
      );
      const confirmedEvidenceIds = candidate.supportingEvidenceIds.filter((id) => hardEvidenceIds.has(id));
      return { confirmedEvidenceIds };
    },

    async generateActions({ finalRootCause }: GenerateActionsInput): Promise<GenerateActionsOutput> {
      return { actions: FAULT_ACTIONS[finalRootCause] ?? GENERIC_ACTIONS };
    },
  };
}

const EMBEDDING_DIMENSIONS = 64;

function hashToken(token: string): number {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function embedText(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  for (const token of tokens) {
    const bucket = hashToken(token) % EMBEDDING_DIMENSIONS;
    vector[bucket] = (vector[bucket] ?? 0) + 1;
  }
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vector.map((v) => v / magnitude);
}

export function createMockEmbeddingProvider(): EmbeddingProvider {
  return {
    name: "mock",
    async embed(texts: string[]): Promise<number[][]> {
      return texts.map(embedText);
    },
  };
}
