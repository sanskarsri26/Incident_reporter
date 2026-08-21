# AI Production Incident Investigator — Execution Design

Status: approved for autonomous overnight build (2026-08-20)
Source plan: `docs/AI_Production_Incident_Investigator_Free_Stack_Plan.md`

## 1. Purpose

Adapt the full free-stack plan into a buildable, testable codebase given
the constraints of the build environment (this sandbox), and define how
the work is decomposed into small, committable, reviewable steps for an
unattended overnight session.

## 2. Environment constraints and how they're handled

| Constraint | Handling |
| --- | --- |
| No Docker installed | Simulator + fault injectors are written as plain Node/TS (runnable with `tsx`/`node` directly), with a `docker-compose.yml` and per-service Dockerfiles authored per the plan for later real use, but not verified running in this session. |
| No live Postgres/Supabase project | Real SQL migrations written for Supabase (`supabase/migrations/`). Data access goes through a repository interface (`lib/db/*`). A mock in-memory repository implements the same interface for tests and local dev without a database. |
| No Gemini API key | `lib/gemini/*` defines a `LLMProvider`/`EmbeddingProvider` interface. A real `GeminiProvider` calls the API when `GEMINI_API_KEY` is set. A `MockProvider` (deterministic, seeded) is used in tests and as the default local dev fallback so the app runs end-to-end with zero external accounts. |
| No Vercel/Upstash accounts | App is a standard Next.js app deployable to Vercel; env-driven config documented in `.env.example` and README. Not deployed from this session. |
| No `gh` CLI | No PRs opened from this session; commits go straight to `main` per explicit instruction. |

This means: everything that can be verified by `npm run build`, `npm test`,
and `npm run lint` will be built and verified for real. Anything that
requires an external paid/free-tier account (actual Supabase project,
actual Gemini key, actual Vercel deploy) is left as a documented manual
step for the repo owner.

## 3. Repository structure

Following Appendix A of the plan, with the provider-abstraction addition:

```text
app/                 Next.js app router: pages + API routes
components/          UI components
lib/
  gemini/            LLMProvider + EmbeddingProvider interfaces, Gemini + Mock impls
  db/                 Repository interface, Supabase impl, in-memory mock impl
  retrieval/          RAG: embedding search + keyword filter + rerank
  evaluation/         Metrics: accuracy, recall@k, latency, ablation runner
  security/           Zod schemas, rate limiting, input size limits
  scoring/            Ranking-score heuristic, evidence-citation validation
simulator/
  services/           Simulated microservices (gateway, checkout, payment, inventory)
  fault-injection/     Fault injectors (one module per fault type)
  traffic/             Synthetic traffic generator
data/
  runbooks/            Markdown runbooks per fault category
  incident-manifests/  Generated ground-truth incident JSON
scripts/
  seed.ts              Seed DB (or mock store) from data/
  evaluate.ts           Run evaluation harness, print/report metrics
tests/                 Vitest unit/integration tests
supabase/migrations/    Real SQL schema + pgvector setup
.github/workflows/       CI: lint, typecheck, unit tests, build
docker-compose.yml, simulator Dockerfiles
.env.example, README.md
```

## 4. Task breakdown (drives the implementation plan and commit sequence)

Each numbered item below is intentionally small enough to be one or a
handful of commits (scaffold → types → logic → tests → wiring), following
TDD where the unit has real logic to test:

1. Repo scaffold: Next.js + TypeScript + Tailwind, lint/format/tsconfig, base layout.
2. Domain types shared across app/simulator (`lib/types.ts`): incidents, services, log/metric events, documents, analysis runs, predictions, evidence, recommendations.
3. DB repository interface + in-memory mock implementation + unit tests.
4. Supabase migrations (schema matching section 5 of the plan) + Supabase repository implementation (compiles against the interface; exercised via tests using the mock, real client wiring left for deploy time).
5. Incident CRUD API routes (`/api/incidents`, `/api/incidents/:id`) + tests.
6. Simulator core: service graph model + traffic generator.
7. Fault injectors: connection-pool exhaustion, slow query, memory leak, dependency timeout, CPU spike, Redis unavailable, worker backlog, bad config — one module + one test each.
8. Ground-truth incident generator producing manifests matching the plan's JSON schema; generate 50+ incidents across 8 fault types.
9. Seed script loading manifests + runbooks into the repository.
10. Compact incident summary builder (`lib/summary`) + tests.
11. LLMProvider/EmbeddingProvider interfaces + MockProvider (deterministic) + GeminiProvider (real, key-gated) + tests against the mock.
12. Retrieval: embedding similarity search + keyword/metadata filter + merge/rerank, against the mock embedding provider + in-memory vector store.
13. Investigation pipeline (candidates → evidence attach → rank → actions → validate) as pure, testable stages wired to providers.
14. Evidence-citation validation (reject unknown IDs) + contradiction handling + tests.
15. Ranking-score heuristic (`lib/scoring`) implementing the weighted formula + tests.
16. `/api/incidents/:id/investigate` route wiring the pipeline, with Zod validation, size limits, and mocked-provider-by-default behavior.
17. `/api/incidents/:id/similar`, `/api/incidents/:id/timeline`, `/api/evaluation/summary`, `/api/feedback` routes + tests.
18. Rate limiting middleware (in-memory token bucket by default, Upstash-backed when configured) + tests.
19. Evaluation harness: dev/val/test split, Top-1/Top-3 accuracy, Evidence Recall@5, unsupported-evidence rate, latency percentiles, ablation runner (A–D from the plan) + `scripts/evaluate.ts`.
20. Frontend pages: Dashboard, Incidents list, Incident Detail, Investigation, Similar Incidents, Evaluation, About — built against the API routes.
21. Security pass: confirm no secret is `NEXT_PUBLIC_*`, `.env.local` gitignored, friendly 429 handling.
22. CI workflow: lint, typecheck, unit tests (mocked provider), build.
23. Playwright smoke test (optional, only if environment allows a headless browser run).
24. README rewrite: architecture, setup, measured results placeholder, limitations, how to plug in real Gemini/Supabase/Vercel accounts.
25. Run the evaluation harness against the generated dataset and commit the actual measured report (real numbers from the mock provider, clearly labeled as mock-provider baseline, not a Gemini-quality claim).
26. Independent review pass (Opus subagent via code-review skill) over the full diff, then fix findings.

Each item above is expected to expand into several commits (interface,
implementation, tests, wiring) to comfortably clear the 100-commit target
without inventing busywork — the granularity is real: every commit leaves
the tree building and tests passing.

## 5. What's explicitly deferred to the repo owner

- Creating the real Supabase project and running the migrations against it.
- Obtaining a real `GEMINI_API_KEY` and setting Vercel env vars.
- Actual Vercel deployment.
- Verifying `docker-compose up` on a machine with Docker installed.
- Running the evaluation harness against the real Gemini provider (only the mock-provider baseline is produced in this session).
- The final Codex review pass mentioned by the user — this session cannot invoke Codex; it leaves the branch in a reviewable state.

## 6. Review pipeline for this session

1. Build incrementally per section 4, committing after each unit of work.
2. Once the core system (items 1–20) is in place and passing tests, dispatch an Opus subagent to run a full code review (correctness + simplification) over the changes.
3. Apply fixes for confirmed findings, committing fixes separately.
4. Run full verification (`npm run lint && npm run typecheck && npm test && npm run build`) before considering the session done.
5. Leave a summary commit / README section describing what's real vs. mocked, for the owner and for Codex's review in the morning.
