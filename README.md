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
npm test            # 230+ unit/integration tests, all against mocks
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
committed under `data/incident-manifests/`, stratified into dev/validation/test
splits per fault type (`lib/evaluation/split.ts`), targeting roughly
60/20/20 — in practice 32/8/16 (57% / 14% / 29%), because each fault type
only has 7 incidents and 7 × 0.6/0.2/0.2 rounds to 4/1/2 per type rather
than landing exactly on the target ratio.

Incident titles are symptom-level and picked pseudo-randomly per incident
(not 1:1 with the fault type), and severity/status are similarly
decoupled from the fault — see the comment at the top of
`scripts/generate-incidents.ts` for why: a title or severity that gave
away the diagnosis would let a model score well by echoing it back
rather than by reasoning over the evidence.

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
full explanation of that gap. (The prompt sent to a real model constrains
`rootCause` to this dataset's closed set of fault slugs — see
`lib/gemini/prompts.ts` — so a real model's output is directly comparable
to this same exact-match metric rather than scoring zero on a natural-
language mismatch.)

| Metric | Value |
| --- | --- |
| Top-1 root-cause accuracy | 25.0% |
| Top-1 tie rate | 37.5% |
| Top-3 root-cause accuracy | 87.5% |
| Evidence tag presence rate ("Evidence Recall@5") | 31.3% |
| Unsupported-evidence rate | 0.0% |
| P50 / P95 latency | ~2ms / ~4ms |
| Avg. requests per investigation | 7 |

**Top-1 tie rate** is the fraction of test cases where the top-ranked
candidate's ranking score exactly tied another candidate's — read it
alongside top-1 accuracy. Candidate ranking now breaks ties
deterministically (`lib/investigation/pipeline.ts`: by model score, then
root cause alphabetically) so results are reproducible run-to-run, but a
high tie rate is still a real signal that the ranking score doesn't have
enough dynamic range to separate candidates for over a third of these
cases, not something to read past.

Ablations (same held-out split, n=16 test cases):

- **Hybrid retrieval beats vector-only retrieval on runbook-match rate**:
  the correct runbook was the top vector-only match in 1 of 16 cases vs.
  4 of 16 with hybrid retrieval. Direction is consistent and the gap is
  the largest of any ablation here, but at n=16 the raw counts are the
  honest way to read it, not a precise percentage.
- **Runbook retrieval raises top-3 accuracy but not top-1 in this run**:
  top-3 accuracy is 87.5% with retrieval enabled vs. 75.0% without (a
  2-of-16-case difference); top-1 accuracy is unchanged at 25.0% in both
  arms. Treat this as directional at this sample size.
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

Vitest covers `lib/`, `app/api/`, `scripts/`, and `simulator/` (230+
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
5. Deploy to [Vercel](https://vercel.com) (Hobby plan is enough). No
   `vercel.json` is needed — Vercel auto-detects Next.js and runs `npm run
   build`. Set the same environment variables from `.env.example` as
   server-side (not `NEXT_PUBLIC_*`) project env vars in the Vercel
   dashboard.
6. Re-run `npm run evaluate` with `GEMINI_API_KEY` set to produce a report
   against the real model.

None of this was performed automatically — provisioning real cloud
accounts is outside what an unattended build session can or should do
without you present to authorize it.

**Important caveat if you deploy to Vercel without Supabase configured:**
Vercel's serverless functions are stateless and ephemeral across
invocations — separate function instances (and even separate warm
invocations of what looks like "the same" function) are not guaranteed to
share memory. `lib/db/index.ts`'s in-memory-repository auto-seed trick
(see "Runs with zero external accounts" above) works reliably for a
single long-lived process like `next dev` or `next start` on your own
machine, but on Vercel, different invocations can each cold-start their
own module instance, re-seed independently, and not see each other's
writes — so a new incident or a piece of feedback submitted in one
request may not be visible on the next. **Mock/in-memory mode should be
treated as a local-dev and CI mode only.** For a Vercel deployment to
behave consistently for real users, configure `SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY` so state lives in Postgres instead of
process memory.

## What's not built (by design, per the plan's scope)

Kubernetes, multi-cloud deployment, real user auth, Slack/PagerDuty
integration, model fine-tuning, voice features, a second vector database,
and large multi-agent workflows are explicitly out of scope for v1 — see
plan section 4.
