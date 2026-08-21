# AI Production Incident Investigator

## Complete Zero-Cost Build Plan

**Vercel + Gemini API + Supabase + GitHub**

> **Goal:** Build a serious AI + backend + cloud portfolio project without requiring paid infrastructure or paid model usage.

| Layer | Recommended free option | Purpose |
| --- | --- | --- |
| Frontend + API | Vercel Hobby | Host the UI and server-side API routes |
| Source + CI | GitHub + GitHub Actions | Version control, tests, deployment workflow |
| LLM | Gemini Developer API Free Tier | Root-cause analysis and evidence checking |
| Embeddings | Gemini Embedding API Free Tier | Semantic search and incident similarity |
| Database + vectors | Supabase Free + pgvector | Incidents, logs, documents, embeddings |
| Cache / rate limit | Upstash Redis Free | Optional caching and request control |
| Charts | Recharts | Evaluation and incident dashboards |
| Local simulation | Docker Compose | Generate controlled incidents on your computer |

Prepared as a practical build guide. Free-tier limits can change, so the design treats every external service as replaceable.

## Contents

1. [Project definition and final demo](#1-project-definition-and-final-demo)
2. [Zero-cost architecture](#2-zero-cost-architecture)
3. [Why Vercel instead of GitHub Pages](#3-why-vercel-instead-of-github-pages)
4. [Functional scope](#4-functional-scope)
5. [Data model](#5-data-model)
6. [Incident simulator and fault injection](#6-incident-simulator-and-fault-injection)
7. [AI investigation pipeline](#7-ai-investigation-pipeline)
8. [RAG and similar-incident search](#8-rag-and-similar-incident-search)
9. [Evidence checking and confidence](#9-evidence-checking-and-confidence)
10. [API design](#10-api-design)
11. [Frontend pages](#11-frontend-pages)
12. [Evaluation framework](#12-evaluation-framework)
13. [Free-tier deployment design](#13-free-tier-deployment-design)
14. [Security and API-key handling](#14-security-and-api-key-handling)
15. [Testing and CI/CD](#15-testing-and-cicd)
16. [Eight-week implementation plan](#16-eight-week-implementation-plan)
17. [Minimum viable version](#17-minimum-viable-version)
18. [Stretch goals](#18-stretch-goals)
19. [Resume and interview output](#19-resume-and-interview-output)
20. [Definition of done](#20-definition-of-done)
21. [Appendix A. Repository structure](#appendix-a-repository-structure)
22. [Appendix B. Free-service assumptions and sources](#appendix-b-free-service-assumptions-and-sources)

## 1. Project definition and final demo

Build a web application that investigates failures in a small distributed system. A user selects an incident, uploads or views logs and metrics, and asks the system to investigate. The system returns a ranked root cause, supporting evidence, affected services, suggested actions, and similar historical incidents.

The project is not a chatbot. The main value is the full system: data ingestion, retrieval, structured AI output, evaluation, security, deployment, and measurable results.

### Core project question

How accurately can an AI-assisted incident investigator diagnose failures using logs, system context, runbooks, and historical incidents while staying within a free deployment stack?

### Final demo flow

1. Open the public Vercel deployment.
2. Select a prepared incident such as database connection exhaustion.
3. Show the incident timeline, logs, metrics, and service dependencies.
4. Click **Investigate**.
5. Show the model-generated root-cause candidates and the evidence used for each candidate.
6. Show the final ranked root cause and recommended actions.
7. Open **Similar Incidents** to show vector retrieval.
8. Open **Evaluation** to show measured accuracy, retrieval quality, latency, and API usage.

### Example result

```text
Probable root cause: PostgreSQL connection-pool exhaustion
Confidence: 0.89

Evidence:
1. Connection timeouts increased sharply at 10:22:03.
2. Active connections reached the configured pool limit.
3. Payment-worker retries started 12 seconds later.
4. Historical incident INC-0832 had a very similar pattern.

Suggested checks:
- Inspect active and idle database connections.
- Check long-running transactions.
- Review pool size and connection release behavior.
```

## 2. Zero-cost architecture

The deployed version should be intentionally smaller than a production enterprise platform. It should still show real system design while fitting the limits of free services.

```text
Browser
 |
 v
Vercel Web App
 |
 +--> Server-side API routes --> Gemini API
 |                  |
 |                  +--> Generation
 |                  +--> Embeddings
 |
 +--> Supabase PostgreSQL + pgvector
 |      |
 |      +--> incidents
 |      +--> logs and metrics summaries
 |      +--> runbooks
 |      +--> historical incidents
 |      +--> embeddings
 |
 +--> Upstash Redis (optional)
        +--> cache
        +--> rate limiting

Local machine only:
Docker Compose microservices + fault injection + dataset generation
```

### Recommended technology choices

| Area | Choice | Why |
| --- | --- | --- |
| Web framework | Next.js + TypeScript | One codebase for UI and server-side API routes on Vercel |
| Styling | Tailwind CSS | Fast UI work without spending weeks on design |
| Charts | Recharts | Simple dashboard charts |
| Database | Supabase Postgres | Free hosted relational database |
| Vector search | Supabase pgvector | Keeps normal data and embeddings together |
| AI generation | Gemini free-tier model | No required paid API usage for a portfolio-sized demo |
| Embeddings | Gemini Embedding | Free-tier embedding option and simple integration |
| Cache | Upstash Redis | Serverless-friendly free cache, optional for v1 |
| Validation | Zod | Validate API inputs and structured model outputs |
| Testing | Vitest + Playwright | Unit and end-to-end tests |
| CI | GitHub Actions | Run checks on every pull request |
| Hosting | Vercel Hobby | Best fit for frontend plus server-side API routes |

## 3. Why Vercel instead of GitHub Pages

GitHub Pages is useful for static HTML, CSS, and JavaScript. It does not give you a safe server-side place to keep a private Gemini key. If the browser calls Gemini directly with a key placed in frontend JavaScript, visitors can inspect the page bundle or network calls and recover that key.

### Recommended deployment

```text
Browser
 | POST /api/investigate
 v
Vercel server-side route
 | reads GEMINI_API_KEY from server environment
 v
Gemini API
```

Use Vercel for the working application. GitHub Pages can still host a separate static portfolio page or project documentation, but it should not hold the private Gemini key.

> **Rule:** Never put `GEMINI_API_KEY` in `NEXT_PUBLIC_*` variables, browser JavaScript, GitHub source code, or committed `.env` files.

## 4. Functional scope

### Must-have features

- Incident list with severity, status, service, and start time.
- Incident detail page with logs, metric summaries, timeline, and known service dependencies.
- Investigate action that calls a server-side endpoint.
- Structured AI output with root-cause candidates, evidence IDs, contradictions, final diagnosis, and suggested actions.
- Runbook retrieval using embeddings and pgvector.
- Similar historical incident search.
- Evaluation page with actual measured metrics.
- Usage tracking for requests, latency, token counts when available, and rate-limit failures.
- Public demo dataset that does not contain private company data.

### Do not build in version 1

- Kubernetes
- Multi-cloud deployment
- Complex user authentication
- Slack or PagerDuty integration
- Fine-tuning a model
- Voice features
- More than one vector database
- Large multi-agent workflows

These can be stretch goals, but they should not delay the core system and evaluation.

## 5. Data model

Keep the schema simple enough to finish but rich enough to discuss in a system-design interview.

| Table | Main fields | Purpose |
| --- | --- | --- |
| `incidents` | `id`, `title`, `severity`, `status`, `started_at`, `root_cause_truth` | One row per incident |
| `services` | `id`, `name`, `type` | Services in the simulated system |
| `service_dependencies` | `source_service`, `target_service` | Dependency graph |
| `log_events` | `incident_id`, `timestamp`, `service`, `level`, `template`, `count` | Normalized or clustered logs |
| `metric_events` | `incident_id`, `timestamp`, `service`, `metric`, `value` | Key metric samples |
| `documents` | `id`, `title`, `body`, `doc_type`, `embedding` | Runbooks and service docs |
| `analysis_runs` | `incident_id`, `model`, `prompt_version`, `latency_ms`, `status` | Every AI investigation |
| `predictions` | `analysis_run_id`, `root_cause`, `rank`, `confidence` | Ranked model outputs |
| `evidence` | `prediction_id`, `source_type`, `source_id`, `support_type` | Evidence links |
| `recommendations` | `analysis_run_id`, `action`, `priority` | Suggested actions |

### Important design choice

Do not store thousands of repeated raw log lines in the cloud just because you can. The simulator can keep raw data locally, while the hosted demo stores normalized and clustered events. This saves database space and model tokens.

## 6. Incident simulator and fault injection

The simulator is the source of your labeled evaluation data. Run it locally with Docker Compose so you do not pay for compute hosting.

### Small simulated system

```text
client -> gateway -> checkout-service -> payment-service -> postgres
                  |
                  +-> inventory-service -> redis
```

### Faults to implement first

| Category | Fault | Observable evidence |
| --- | --- | --- |
| Database | Connection-pool exhaustion | Timeouts, max active connections, retries |
| Database | Slow query | Query duration spike, API latency increase |
| Application | Memory leak | Memory climb, restart or OOM event |
| Application | Dependency timeout | Upstream retries, downstream timeout |
| Infrastructure | CPU spike | CPU saturation and growing latency |
| Cache | Redis unavailable | Cache errors and DB load increase |
| Messaging | Worker backlog | Queue growth and processing delay |
| Deployment | Bad configuration | Errors begin immediately after config change |

### Ground-truth record

```json
{
  "incident_id": "INC-0042",
  "fault": "db_connection_pool_exhaustion",
  "root_service": "postgres",
  "affected_services": ["payment-service", "checkout-service"],
  "expected_evidence": ["db_pool_at_limit", "connection_timeout", "worker_retry"],
  "valid_actions": ["inspect_connections", "check_long_transactions", "review_pool_config"]
}
```

### Dataset target

Start with 40 to 60 incidents across at least six fault types. Increase to 100 to 150 incidents only after the full evaluation pipeline works. Quality and clean ground truth matter more than a large number.

## 7. AI investigation pipeline

Use a staged workflow rather than one huge prompt. Each stage should produce JSON that you can validate and save.

```text
Incident data
    |
    v
1. Build compact incident summary
    |
    v
2. Retrieve runbooks and similar incidents
    |
    v
3. Generate 3 root-cause candidates
    |
    v
4. Attach supporting and contradicting evidence
    |
    v
5. Rank candidates
    |
    v
6. Generate suggested actions
    |
    v
7. Validate JSON and save analysis
```

### Structured model output

```json
{
  "candidates": [
    {
      "root_cause": "database_connection_pool_exhaustion",
      "score": 0.89,
      "supporting_evidence": ["LOG-18", "METRIC-7", "INC-0083"],
      "contradicting_evidence": []
    }
  ],
  "final_root_cause": "database_connection_pool_exhaustion",
  "recommended_actions": ["inspect active connections", "check long transactions"]
}
```

### Model choice

Use a Gemini model that is available to your project on the free tier. Do not hard-code the model name everywhere. Put it in configuration so you can change models when availability or free-tier limits change.

## 8. RAG and similar-incident search

RAG should improve the investigation, not exist only so the resume says RAG.

### Knowledge base

- Runbooks for each fault category
- Service descriptions
- Dependency descriptions
- Known failure symptoms
- Resolved historical incidents

### Retrieval flow

```text
incident summary
     |
     +--> embedding
     |      |
     |      v
     | pgvector similarity search
     |
     +--> keyword filters: service, severity, event type
     |
     v
merge + rerank
     |
     v
top context sent to Gemini
```

### Version 1 retrieval

Use vector similarity plus simple SQL filters. Do not add a separate search engine initially. Later, compare vector-only search with a simple hybrid method that combines vector similarity and keyword overlap.

## 9. Evidence checking and confidence

A strong version should not let the model invent evidence. Every evidence item shown to the user must reference a real stored log event, metric, document, or historical incident.

### Evidence rules

- Give every evidence item a stable ID before the model sees it.
- Require the model to cite only those IDs.
- Reject or flag output that references an unknown ID.
- Show supporting and contradicting evidence separately.
- Do not present the model's self-reported confidence as a calibrated probability.

### Practical confidence score

For the portfolio version, use a transparent heuristic score based on retrieval similarity, number of supporting evidence items, contradiction count, and agreement between candidate-generation and verification stages. Call it a ranking score unless you later calibrate it against held-out incidents.

```text
ranking_score =
  0.35 * evidence_coverage
+ 0.30 * retrieval_similarity
+ 0.20 * historical_match
+ 0.15 * verifier_support
- contradiction_penalty
```

## 10. API design

Use Next.js server-side API routes so the same Vercel project handles the UI and secure calls to Gemini and Supabase.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/incidents` | List incidents |
| `GET` | `/api/incidents/:id` | Incident details |
| `POST` | `/api/incidents/:id/investigate` | Run investigation |
| `GET` | `/api/incidents/:id/similar` | Find similar incidents |
| `GET` | `/api/incidents/:id/timeline` | Build timeline |
| `GET` | `/api/evaluation/summary` | Dashboard metrics |
| `POST` | `/api/feedback` | Record demo feedback |

### Keep requests small

Do not upload giant raw log files through the public demo. Preload curated incidents, or enforce a small upload limit. Free serverless functions and free AI quotas are not meant for unbounded log ingestion.

## 11. Frontend pages

| Page | What it shows |
| --- | --- |
| Dashboard | Incident counts, severity breakdown, recent incidents, evaluation snapshot |
| Incidents | Searchable incident list |
| Incident Detail | Timeline, logs, metric cards, service graph |
| Investigation | Candidates, final root cause, evidence, contradictions, actions |
| Similar Incidents | Historical matches with similarity scores |
| Evaluation | Accuracy, Top-3 accuracy, Recall@K, latency, failure rate |
| About | Architecture, stack, limitations, GitHub link |

### UI priority

Make the investigation page excellent. That is the page a recruiter or interviewer is most likely to remember. The rest can be clean and simple.

## 12. Evaluation framework

Evaluation is what separates this project from a normal AI demo. Freeze a held-out test set before final tuning.

### Primary metrics

| Metric | Meaning | Target for a useful demo |
| --- | --- | --- |
| Top-1 root-cause accuracy | Exact correct root cause is ranked first | Report actual result |
| Top-3 accuracy | Correct root cause appears in top three | Report actual result |
| Evidence Recall@5 | Required evidence appears in top five retrieved items | Report actual result |
| Unsupported-evidence rate | Model cites evidence that does not exist | Drive toward 0% |
| P50 / P95 latency | End-to-end investigation time | Measure, do not guess |
| API failure rate | 429, timeout, parse, or provider errors | Measure |
| Requests per investigation | How many model calls each investigation needs | Keep small on free tier |

### Ablation experiments

| Experiment | Compare |
| --- | --- |
| A | Gemini with incident summary only vs. Gemini + runbook retrieval |
| B | RAG without history vs. RAG + similar historical incidents |
| C | Direct diagnosis vs. candidate generation + evidence verification |
| D | Vector-only retrieval vs. vector + metadata/keyword filtering |

### Evaluation split

A simple starting split is 60% development, 20% validation, and 20% held-out test incidents, stratified by fault type. Do not tune prompts repeatedly on the final test set.

## 13. Free-tier deployment design

### Deployed components

| Component | Where it runs | Cost plan |
| --- | --- | --- |
| Next.js UI | Vercel | Hobby / free |
| API routes | Vercel Functions | Hobby / free |
| Postgres | Supabase | Free |
| pgvector | Supabase Postgres extension | Included with database |
| Gemini generation | Google Gemini Developer API | Free tier, model dependent |
| Gemini embeddings | Google Gemini API | Free tier |
| Redis cache | Upstash | Free, optional |
| CI | GitHub Actions | Free allocation for public portfolio use |
| Simulator | Your local machine | Free |

### What should stay local

- Docker microservices
- Large raw logs
- Fault injection
- Bulk dataset generation
- Large experiment runs
- Development dashboards such as local Grafana if desired

### What the public demo stores

- Small curated incident records
- Clustered log summaries
- Selected metric samples
- Runbooks
- Embeddings
- Analysis results
- Evaluation summaries

## 14. Security and API-key handling

Security matters because a public portfolio deployment can be visited by anyone and free API quotas are easy to exhaust.

### Required controls

- Store `GEMINI_API_KEY` only as a server-side Vercel environment variable.
- Never prefix a secret with `NEXT_PUBLIC_`.
- Keep `.env.local` in `.gitignore`.
- Call Gemini only from server-side code.
- Validate every request body with Zod.
- Add per-IP or session rate limiting before launching publicly.
- Limit investigation size and reject oversized inputs.
- Return friendly handling for 429 quota errors.
- Use synthetic or public demo data only. Do not upload employer logs or private incidents.

### Free-tier privacy note

Google currently states that free-tier Gemini API content may be used to improve its products. Treat the public demo as non-sensitive. Do not send private company logs, secrets, personal data, or confidential documents through the free-tier model.

## 15. Testing and CI/CD

### Test layers

| Layer | Examples |
| --- | --- |
| Unit | Log parser, timeline builder, score calculation, validators |
| Database | Incident queries, vector search function, filters |
| API | Investigate route, invalid input, quota error handling |
| AI contract | Structured JSON parses and evidence IDs are valid |
| End-to-end | Open incident -> investigate -> result displayed |
| Evaluation | Known incidents produce reproducible metric reports |

### GitHub Actions pipeline

```text
push / pull request
  |
  +--> lint
  +--> type check
  +--> unit tests
  +--> API tests with mocked Gemini
  +--> build
  +--> optional Playwright smoke test
  |
  v
Vercel preview deployment
```

Do not call the real Gemini API in every CI run. Mock it for most tests. This protects your quota and makes tests stable.

## 16. Eight-week implementation plan

| Week | Main work | Definition of progress |
| --- | --- | --- |
| 1 | Repository, Next.js, Supabase schema, incident CRUD, sample UI | Create and view incidents end to end |
| 2 | Docker simulator, 4 to 6 services, first 4 fault injectors | Generate labeled incidents locally |
| 3 | Compact incident summary, Gemini server route, structured output | Baseline diagnosis works on dataset |
| 4 | Gemini embeddings, pgvector, runbooks, similar incidents | RAG and incident search work |
| 5 | Evidence IDs, verification, contradiction handling, ranking score | Unsupported citations are detected |
| 6 | Evaluation harness, held-out split, ablations, latency tracking | Real benchmark table exists |
| 7 | Polish UI, rate limiting, error handling, Vercel deployment | Public demo is safe and usable |
| 8 | Final experiment, README, architecture diagram, demo video, resume bullets | Project is interview-ready |

### Weekly rule

Every week should end with something that runs. Avoid spending an entire week only on design documents or frontend polish.

## 17. Minimum viable version

If time gets tight, cut scope aggressively. The minimum strong portfolio version is:

- A public Vercel web app.
- At least 50 labeled synthetic incidents from several fault types.
- A secure server-side Gemini investigation route.
- Supabase Postgres with pgvector retrieval.
- Runbook and historical-incident retrieval.
- Evidence IDs with unsupported-citation checking.
- A held-out evaluation with root-cause accuracy and retrieval metrics.
- A clear README with architecture, measured results, and a short demo.

> A finished, measured 7-feature system is better than a half-working 20-feature system.

## 18. Stretch goals

| Stretch goal | When to add it | Value |
| --- | --- | --- |
| Upstash caching | After core RAG works | Shows caching and protects quotas |
| Service dependency graph | After simulator is stable | Adds blast-radius reasoning |
| Model comparison | After one model is reliable | Adds cost/quality tradeoff discussion |
| Hybrid reranking | After vector baseline is measured | Improves retrieval experiment |
| Streaming UI | After stable structured output | Improves demo feel |
| Authentication | Only if needed | Useful but not core to portfolio signal |
| OpenTelemetry | If time remains | Good observability discussion |

## 19. Resume and interview output

### What you should be able to say

> I built and deployed an AI-assisted incident investigation platform that analyzes synthetic distributed-system incidents, retrieves runbooks and similar historical failures with pgvector, and produces evidence-linked root-cause predictions. I created a labeled fault-injection dataset and measured diagnosis accuracy, retrieval quality, latency, and unsupported-evidence errors on a held-out test set.

### Resume bullet template

> Built and deployed an AI incident-investigation platform using Next.js, Gemini, PostgreSQL/pgvector, and Vercel; evaluated root-cause diagnosis on [N] labeled fault-injection incidents, achieving [actual Top-1]% Top-1 accuracy and [actual Recall@5]% evidence Recall@5 with [actual P95] P95 latency.

Replace every bracketed value with a measured result. Do not invent numbers.

### Interview topics this project creates

- RAG design and failure modes
- Relational vs. vector search
- Serverless API design
- Secret management
- Rate limiting
- Evaluation leakage
- Prompt versioning
- Fault injection
- System dependencies
- Caching
- Latency tradeoffs
- Free-tier constraints and architecture choices

## 20. Definition of done

- Public Vercel URL works without exposing the Gemini key.
- GitHub repository contains clean setup instructions.
- Local simulator can reproduce at least six fault types.
- Ground-truth dataset is versioned.
- At least one held-out evaluation report is committed.
- Every displayed evidence citation maps to real stored evidence.
- RAG and similar-incident retrieval are measured, not only demonstrated.
- Rate limiting and quota errors are handled.
- No private company data is present.
- Architecture diagram and two-minute demo are available.
- Resume bullet uses real measured metrics.

## Appendix A. Repository structure

```text
ai-incident-investigator/
|-- app/
|   |-- api/
|   |   |-- incidents/
|   |   |-- investigate/
|   |   `-- evaluation/
|   |-- incidents/
|   |-- evaluation/
|   `-- page.tsx
|-- components/
|-- lib/
|   |-- gemini/
|   |-- supabase/
|   |-- retrieval/
|   |-- evaluation/
|   `-- security/
|-- simulator/
|   |-- services/
|   |-- fault-injection/
|   `-- traffic/
|-- data/
|   |-- runbooks/
|   `-- incident-manifests/
|-- scripts/
|   |-- seed.ts
|   `-- evaluate.ts
|-- tests/
|-- supabase/
|   `-- migrations/
|-- .github/workflows/
|-- .env.example
|-- docker-compose.yml
`-- README.md
```

### Suggested environment variables

```dotenv
GEMINI_API_KEY=server_only
GEMINI_MODEL=configurable_model_name
GEMINI_EMBED_MODEL=gemini-embedding-001_or_current_choice
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=server_only
NEXT_PUBLIC_SUPABASE_URL=public_if_needed
NEXT_PUBLIC_SUPABASE_ANON_KEY=public_if_using_RLS
UPSTASH_REDIS_REST_URL=optional
UPSTASH_REDIS_REST_TOKEN=optional
```

## Appendix B. Free-service assumptions and sources

These assumptions were checked against official documentation in August 2026. Free plans and quotas can change, so confirm them before deployment.

| Service | Current assumption used in this plan |
| --- | --- |
| GitHub Pages | Static site hosting. Good for documentation, not for safely storing a private AI API key. |
| Vercel | Hobby plan exists for personal/non-commercial projects and supports server-side functions and environment variables. |
| Gemini Developer API | Free tier exists for certain models. Rate limits depend on model and project, and Google recommends checking active limits in AI Studio. |
| Gemini Embeddings | Gemini embedding models are available on the free tier. |
| Supabase | Free plan includes a Postgres database; pgvector is available as a Postgres extension. |
| Upstash Redis | Free Redis tier is available and is enough for optional portfolio caching/rate limiting. |

### Official references

- [Google Gemini API rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Google Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Google Gemini embeddings API](https://ai.google.dev/api/embeddings)
- [GitHub Pages overview](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [Vercel Functions](https://vercel.com/kb/vercel-functions)
- [Vercel environment variables](https://vercel.com/academy/vercel-foundations/vercel-settings)
- [Vercel Hobby terms](https://vercel.com/legal/terms)
- [Supabase pricing](https://supabase.com/pricing)
- [Supabase pgvector](https://supabase.com/docs/guides/database/extensions/pgvector)
- [Upstash Redis pricing](https://upstash.com/pricing/redis)

> **Important:** Google states that free-tier Gemini API content may be used to improve its products. Keep the demo dataset synthetic or otherwise non-sensitive.
