# AI Production Incident Investigator

An AI-assisted investigation platform for simulated production incidents. It
ingests logs and metrics from a fault-injected microservice simulator,
retrieves runbooks and similar historical incidents with embeddings, and
produces evidence-linked, ranked root-cause predictions instead of an
unverifiable free-text answer.

Full design rationale lives in
[`docs/AI_Production_Incident_Investigator_Free_Stack_Plan.md`](docs/AI_Production_Incident_Investigator_Free_Stack_Plan.md)
and [`docs/superpowers/specs/2026-08-20-incident-investigator-build-design.md`](docs/superpowers/specs/2026-08-20-incident-investigator-build-design.md).

## Why this isn't a chatbot

Every root-cause candidate the model proposes must cite evidence IDs from a
catalog built from real stored log events, metric events, retrieved
runbooks, and retrieved historical incidents. Citations that reference an ID
outside that catalog are detected and dropped before the user ever sees
them (`lib/investigation/evidence-validation.ts`). The displayed ranking is
a transparent heuristic — evidence coverage, retrieval similarity,
historical match, and independent-verifier agreement, minus a contradiction
penalty (`lib/scoring/ranking-score.ts`) — not the model's own self-reported
confidence, which the project's design doc explicitly warns against
presenting as a calibrated probability.

## Runs with zero external accounts

Every external integration sits behind a provider interface with two
implementations: a real one (used when credentials are configured) and a
deterministic mock (the default). This means `npm install && npm run dev`
gives you the entire system — API, RAG pipeline, evidence checking,
evaluation — end to end, with no Gemini key, no Supabase project, and no
Docker.

| Integration | Real implementation | Default (no credentials) |
| --- | --- | --- |
| LLM generation | Gemini API (`lib/gemini/gemini-provider.ts`) | Deterministic keyword-matching mock (`lib/gemini/mock-provider.ts`) |
| Embeddings | Gemini embeddings | Deterministic feature-hashed mock |
| Database | Supabase Postgres + pgvector (`lib/db/supabase-repository.ts`) | In-memory repository (`lib/db/memory-repository.ts`) |
| Rate limiting | Upstash Redis REST API | In-memory token bucket |

Set `GEMINI_API_KEY` / `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` /
`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (see
[`.env.example`](.env.example)) to switch each one on independently — the
app doesn't require all three at once.

## Quickstart

```bash
npm install
npm run dev        # http://localhost:3000, fully functional with zero accounts
npm test            # 195+ unit/integration tests, all against mocks
npm run typecheck
npm run lint
npm run build
```

To regenerate the synthetic dataset or re-run the evaluation harness:

```bash
npm run gen:incidents   # regenerate data/incident-manifests/*.json
npm run seed             # load incidents + runbooks into the active repository
npm run evaluate          # re-run the held-out evaluation, write data/evaluation-report.json
```

## Architecture

```text
Browser
 |
 v
Next.js App Router (Vercel)
 |
 +--> Server-side API routes (app/api/**)
 |      +--> lib/gemini        LLMProvider / EmbeddingProvider (real + mock)
 |      +--> lib/retrieval     hybrid vector+keyword doc search, similar-incident search
 |      +--> lib/investigation summary builder, evidence catalog, pipeline orchestrator
 |      +--> lib/scoring       ranking-score heuristic
 |      +--> lib/security      Zod validation, rate limiting
 |
 +--> lib/db (Repository interface) --> Supabase Postgres + pgvector, or in-memory

Local only:
simulator/  fault injectors + traffic generator -> data/incident-manifests/*.json
```

The investigation pipeline (`lib/investigation/pipeline.ts`) runs as
discrete, independently-testable stages: build a compact incident summary →
hybrid-retrieve runbooks and similar historical incidents → build a stable
evidence catalog → generate ranked root-cause candidates → validate every
citation against the real catalog → independently re-verify each
candidate's evidence → compute the ranking score → generate recommended
actions.

## The dataset

`simulator/fault-injection/` implements 8 fault types (connection-pool
exhaustion, slow query, memory leak, dependency timeout, CPU spike, Redis
unavailable, worker backlog, bad-config deploy) against a 6-service
topology (`client → gateway → checkout-service → payment-service →
postgres`, `gateway → inventory-service → redis`), each with a seeded RNG
for reproducibility and a machine-checkable ground-truth manifest (fault
slug, root service, affected services, expected evidence tags, valid
remediation actions). `npm run gen:incidents` produced the 56 incidents
committed under `data/incident-manifests/`, stratified 60/20/20 into
dev/validation/test splits by fault type (`lib/evaluation/split.ts`).

`docker-compose.yml` and `simulator/services/*/Dockerfile` model the same
topology as live containers per the original plan, but were **not runnable
in the build environment** (no Docker installed there) — they're
structurally written against the plan and documented as unverified;
confirm with `docker compose up` on a machine that has Docker.

## Measured evaluation (mock-provider baseline)

Committed at [`data/evaluation-report.json`](data/evaluation-report.json),
produced by `npm run evaluate` against the held-out **test** split (16 of
56 incidents) using the default mock LLM/embedding providers — this is a
baseline for the pipeline's mechanics, **not a claim about Gemini's
diagnostic quality**. Re-running with a real `GEMINI_API_KEY` is expected
to score meaningfully higher, because the mock matches candidate faults by
crude keyword co-occurrence in evidence text and can't tell an anomalous
metric value from a normal one — see the report's own `notes` field for the
full explanation of that gap.

| Metric | Value |
| --- | --- |
| Top-1 root-cause accuracy | 25.0% |
| Top-3 root-cause accuracy | 87.5% |
| Evidence Recall@5 | 93.8% |
| Unsupported-evidence rate | 0.0% |
| P50 / P95 latency | 1ms / 2ms |
| Avg. requests per investigation | 7 |

Ablations (same held-out split):

- **Retrieval matters**: Top-1 accuracy drops from 25.0% to 0% with runbook
  retrieval disabled.
- **Hybrid retrieval beats vector-only**: top-1 correct-runbook match rate
  is 31.3% (hybrid) vs. 25.0% (vector-only).
- Full breakdown, including the history and ranking-score-vs-model-score
  ablations, is in `data/evaluation-report.json`.

## Security

- `GEMINI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are read only in
  server-side modules (`lib/gemini`, `lib/db`) and are never assigned to a
  `NEXT_PUBLIC_*` variable.
- `.env.local` is git-ignored; only `.env.example` (no real values) is
  committed.
- Every API route validates its input with Zod (`lib/security/validation.ts`)
  before touching the repository.
- `/api/incidents/:id/investigate` is rate-limited per client IP and
  returns a distinct, friendly 429 both for our own limiter and for a real
  upstream Gemini quota error — see
  `app/api/incidents/[id]/investigate/route.ts`.
- `/api/feedback` rejects bodies over 4KB and validates message length
  before parsing.

## Testing and CI

Vitest covers `lib/`, `app/api/`, `scripts/`, and `simulator/` (200+
tests); external providers are always mocked or fetch-injected, so CI never
calls a paid API or needs secrets (`.github/workflows/ci.yml`: lint →
typecheck → test → build).

## Deploying for real

1. Create a [Supabase](https://supabase.com) project, run the SQL in
   `supabase/migrations/` (in order) against it, and set `SUPABASE_URL` +
   `SUPABASE_SERVICE_ROLE_KEY`.
2. Get a [Gemini API key](https://ai.google.dev/) and set `GEMINI_API_KEY`
   (optionally `GEMINI_MODEL` / `GEMINI_EMBED_MODEL` to pin specific
   models).
3. Optionally create an [Upstash Redis](https://upstash.com) database and
   set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` for
   cross-instance rate limiting.
4. `npm run seed` against those credentials to load the dataset and
   runbooks into Supabase.
5. Deploy to [Vercel](https://vercel.com) (Hobby plan is enough) with the
   same environment variables set as server-side (not `NEXT_PUBLIC_*`)
   project env vars.
6. Re-run `npm run evaluate` with `GEMINI_API_KEY` set to produce a report
   against the real model.

None of this was performed automatically — provisioning real cloud
accounts is outside what an unattended build session can or should do
without you present to authorize it.

## What's not built (by design, per the plan's scope)

Kubernetes, multi-cloud deployment, real user auth, Slack/PagerDuty
integration, model fine-tuning, voice features, a second vector database,
and large multi-agent workflows are explicitly out of scope for v1 — see
plan section 4.
