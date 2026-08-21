# Phase 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Next.js + TypeScript app skeleton, shared domain types, a repository abstraction over the database (with an in-memory implementation for tests/dev and real Supabase SQL migrations for deployment), and incident CRUD API routes — all covered by passing tests.

**Architecture:** A Next.js 14 App Router project (TypeScript, Tailwind). Data access goes through a `Repository` interface (`lib/db/repository.ts`) so API routes never talk to Supabase directly. Two implementations: `MemoryRepository` (deterministic, used by default and in all tests) and `SupabaseRepository` (real client, used only when `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are set). A factory (`lib/db/index.ts`) picks the implementation based on env.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, Vitest, Zod, `@supabase/supabase-js`.

**Spec:** `docs/superpowers/specs/2026-08-20-incident-investigator-build-design.md` (sections 3, 4 items 1-5); parent plan `docs/AI_Production_Incident_Investigator_Free_Stack_Plan.md` (sections 5, 10).

## Global Constraints

- Node 18+, npm (not yarn/pnpm) — matches what's installed in this environment.
- No secret may ever be assigned to a `NEXT_PUBLIC_*` env var.
- Every DB-touching function must go through the `Repository` interface — no direct Supabase client calls outside `lib/db/supabase-repository.ts`.
- Default repository (no env configured) must be `MemoryRepository`, so `npm test` and `npm run dev` work with zero external accounts.
- All API routes validate input with Zod before touching the repository.
- Commit after each task; each commit must leave `npm test` and `npm run build` passing.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.mjs`
- Create: `tailwind.config.ts`
- Create: `postcss.config.mjs`
- Create: `.eslintrc.json`
- Create: `.gitignore`
- Create: `app/layout.tsx`
- Create: `app/page.tsx`
- Create: `app/globals.css`
- Create: `vitest.config.ts`

**Interfaces:**
- Produces: a running `npm run dev`, `npm run build`, `npm run lint`, `npm test` toolchain that every later task builds on.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "ai-incident-investigator",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "seed": "tsx scripts/seed.ts",
    "evaluate": "tsx scripts/evaluate.ts",
    "gen:incidents": "tsx scripts/generate-incidents.ts"
  },
  "dependencies": {
    "next": "14.2.5",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "zod": "3.23.8",
    "@supabase/supabase-js": "2.45.4",
    "recharts": "2.12.7"
  },
  "devDependencies": {
    "typescript": "5.5.4",
    "@types/node": "20.14.15",
    "@types/react": "18.3.3",
    "@types/react-dom": "18.3.0",
    "tailwindcss": "3.4.10",
    "postcss": "8.4.41",
    "autoprefixer": "10.4.20",
    "vitest": "2.0.5",
    "tsx": "4.16.5",
    "eslint": "8.57.0",
    "eslint-config-next": "14.2.5"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Write `next.config.mjs`**

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
```

- [ ] **Step 4: Write `tailwind.config.ts`**

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};

export default config;
```

- [ ] **Step 5: Write `postcss.config.mjs`**

```javascript
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

- [ ] **Step 6: Write `.eslintrc.json`**

```json
{ "extends": "next/core-web-vitals" }
```

- [ ] **Step 7: Write `.gitignore`**

```text
node_modules/
.next/
out/
.env
.env.local
.env*.local
*.tsbuildinfo
coverage/
.DS_Store
```

- [ ] **Step 8: Write `app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 9: Write `app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Production Incident Investigator",
  description: "AI-assisted root-cause investigation for simulated production incidents.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100">{children}</body>
    </html>
  );
}
```

- [ ] **Step 10: Write `app/page.tsx`**

```tsx
export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-8">
      <h1 className="text-2xl font-semibold">AI Production Incident Investigator</h1>
      <p className="text-slate-400">
        Select an incident, run an investigation, and review evidence-linked root causes.
      </p>
      <a className="text-sky-400 underline" href="/incidents">
        View incidents
      </a>
    </main>
  );
}
```

- [ ] **Step 11: Write `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
```

- [ ] **Step 12: Install dependencies**

Run: `npm install`
Expected: lockfile created, no errors.

- [ ] **Step 13: Verify build**

Run: `npm run build`
Expected: build succeeds (may warn about missing env vars — that's fine at this stage).

- [ ] **Step 14: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.mjs tailwind.config.ts postcss.config.mjs .eslintrc.json .gitignore app/ vitest.config.ts
git commit -m "chore: scaffold Next.js + TypeScript + Tailwind project"
```

---

### Task 2: Shared domain types

**Files:**
- Create: `lib/types.ts`
- Test: `tests/types.test.ts`

**Interfaces:**
- Consumes: nothing (foundation types).
- Produces: `Incident`, `Service`, `ServiceDependency`, `LogEvent`, `MetricEvent`, `Document`, `AnalysisRun`, `Prediction`, `Evidence`, `Recommendation`, `Severity`, `IncidentStatus` types used by every later task.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/types.test.ts
import { describe, it, expect } from "vitest";
import type { Incident, Severity } from "@/lib/types";
import { SEVERITIES } from "@/lib/types";

describe("domain types", () => {
  it("SEVERITIES lists all Severity values in priority order", () => {
    expect(SEVERITIES).toEqual(["sev1", "sev2", "sev3", "sev4"]);
  });

  it("an Incident object satisfies the Incident type", () => {
    const incident: Incident = {
      id: "INC-0001",
      title: "DB connection pool exhaustion",
      severity: "sev1" as Severity,
      status: "resolved",
      startedAt: "2026-01-01T00:00:00.000Z",
      resolvedAt: "2026-01-01T00:30:00.000Z",
      rootCauseTruth: "db_connection_pool_exhaustion",
      affectedServices: ["payment-service", "checkout-service"],
    };
    expect(incident.id).toBe("INC-0001");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/types.test.ts`
Expected: FAIL — `Cannot find module '@/lib/types'`.

- [ ] **Step 3: Write `lib/types.ts`**

```typescript
export const SEVERITIES = ["sev1", "sev2", "sev3", "sev4"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const INCIDENT_STATUSES = ["open", "investigating", "resolved"] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export interface Incident {
  id: string;
  title: string;
  severity: Severity;
  status: IncidentStatus;
  startedAt: string;
  resolvedAt: string | null;
  rootCauseTruth: string;
  affectedServices: string[];
}

export interface Service {
  id: string;
  name: string;
  type: string;
}

export interface ServiceDependency {
  sourceService: string;
  targetService: string;
}

export const LOG_LEVELS = ["debug", "info", "warn", "error", "fatal"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface LogEvent {
  id: string;
  incidentId: string;
  timestamp: string;
  service: string;
  level: LogLevel;
  template: string;
  count: number;
}

export interface MetricEvent {
  id: string;
  incidentId: string;
  timestamp: string;
  service: string;
  metric: string;
  value: number;
}

export const DOC_TYPES = ["runbook", "service_description", "postmortem"] as const;
export type DocType = (typeof DOC_TYPES)[number];

export interface DocumentRecord {
  id: string;
  title: string;
  body: string;
  docType: DocType;
  embedding: number[] | null;
}

export interface AnalysisRun {
  id: string;
  incidentId: string;
  model: string;
  promptVersion: string;
  latencyMs: number;
  status: "succeeded" | "failed";
  createdAt: string;
}

export interface Prediction {
  id: string;
  analysisRunId: string;
  rootCause: string;
  rank: number;
  confidence: number;
}

export const EVIDENCE_SOURCE_TYPES = ["log_event", "metric_event", "document", "incident"] as const;
export type EvidenceSourceType = (typeof EVIDENCE_SOURCE_TYPES)[number];

export const EVIDENCE_SUPPORT_TYPES = ["supporting", "contradicting"] as const;
export type EvidenceSupportType = (typeof EVIDENCE_SUPPORT_TYPES)[number];

export interface Evidence {
  id: string;
  predictionId: string;
  sourceType: EvidenceSourceType;
  sourceId: string;
  supportType: EvidenceSupportType;
}

export interface Recommendation {
  id: string;
  analysisRunId: string;
  action: string;
  priority: number;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts tests/types.test.ts
git commit -m "feat: add shared domain types"
```

---

### Task 3: Repository interface + in-memory implementation

**Files:**
- Create: `lib/db/repository.ts`
- Create: `lib/db/memory-repository.ts`
- Test: `tests/db/memory-repository.test.ts`

**Interfaces:**
- Consumes: types from `lib/types.ts` (Task 2).
- Produces: `Repository` interface and `createMemoryRepository(seed?: RepositorySeed): Repository`, used by every API route task and by `lib/db/index.ts` (Task 4).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/db/memory-repository.test.ts
import { describe, it, expect } from "vitest";
import { createMemoryRepository } from "@/lib/db/memory-repository";
import type { Incident } from "@/lib/types";

const sampleIncident: Incident = {
  id: "INC-0001",
  title: "DB connection pool exhaustion",
  severity: "sev1",
  status: "resolved",
  startedAt: "2026-01-01T00:00:00.000Z",
  resolvedAt: null,
  rootCauseTruth: "db_connection_pool_exhaustion",
  affectedServices: ["payment-service"],
};

describe("createMemoryRepository", () => {
  it("returns an empty incident list when unseeded", async () => {
    const repo = createMemoryRepository();
    expect(await repo.listIncidents()).toEqual([]);
  });

  it("round-trips a seeded incident through listIncidents and getIncident", async () => {
    const repo = createMemoryRepository({ incidents: [sampleIncident] });
    expect(await repo.listIncidents()).toEqual([sampleIncident]);
    expect(await repo.getIncident("INC-0001")).toEqual(sampleIncident);
  });

  it("getIncident returns null for an unknown id", async () => {
    const repo = createMemoryRepository();
    expect(await repo.getIncident("missing")).toBeNull();
  });

  it("upsertIncident adds a new incident and is idempotent on id", async () => {
    const repo = createMemoryRepository();
    await repo.upsertIncident(sampleIncident);
    await repo.upsertIncident({ ...sampleIncident, title: "Updated title" });
    const all = await repo.listIncidents();
    expect(all).toHaveLength(1);
    expect(all[0]?.title).toBe("Updated title");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/db/memory-repository.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `lib/db/repository.ts`**

```typescript
import type {
  Incident,
  Service,
  ServiceDependency,
  LogEvent,
  MetricEvent,
  DocumentRecord,
  AnalysisRun,
  Prediction,
  Evidence,
  Recommendation,
} from "@/lib/types";

export interface RepositorySeed {
  incidents?: Incident[];
  services?: Service[];
  serviceDependencies?: ServiceDependency[];
  logEvents?: LogEvent[];
  metricEvents?: MetricEvent[];
  documents?: DocumentRecord[];
}

export interface Repository {
  listIncidents(): Promise<Incident[]>;
  getIncident(id: string): Promise<Incident | null>;
  upsertIncident(incident: Incident): Promise<void>;

  listServices(): Promise<Service[]>;
  listServiceDependencies(): Promise<ServiceDependency[]>;

  listLogEvents(incidentId: string): Promise<LogEvent[]>;
  listMetricEvents(incidentId: string): Promise<MetricEvent[]>;
  insertLogEvents(events: LogEvent[]): Promise<void>;
  insertMetricEvents(events: MetricEvent[]): Promise<void>;

  listDocuments(): Promise<DocumentRecord[]>;
  upsertDocument(document: DocumentRecord): Promise<void>;

  saveAnalysisRun(run: AnalysisRun): Promise<void>;
  savePredictions(predictions: Prediction[]): Promise<void>;
  saveEvidence(evidence: Evidence[]): Promise<void>;
  saveRecommendations(recommendations: Recommendation[]): Promise<void>;

  getLatestAnalysisRun(incidentId: string): Promise<AnalysisRun | null>;
  getPredictionsForRun(analysisRunId: string): Promise<Prediction[]>;
  getEvidenceForPrediction(predictionId: string): Promise<Evidence[]>;
  getRecommendationsForRun(analysisRunId: string): Promise<Recommendation[]>;
}
```

- [ ] **Step 4: Write `lib/db/memory-repository.ts`**

```typescript
import type { Repository, RepositorySeed } from "@/lib/db/repository";
import type {
  Incident,
  Service,
  ServiceDependency,
  LogEvent,
  MetricEvent,
  DocumentRecord,
  AnalysisRun,
  Prediction,
  Evidence,
  Recommendation,
} from "@/lib/types";

export function createMemoryRepository(seed: RepositorySeed = {}): Repository {
  const incidents = new Map<string, Incident>((seed.incidents ?? []).map((i) => [i.id, i]));
  const services = [...(seed.services ?? [])];
  const serviceDependencies = [...(seed.serviceDependencies ?? [])];
  const logEvents = new Map<string, LogEvent[]>();
  const metricEvents = new Map<string, MetricEvent[]>();
  const documents = new Map<string, DocumentRecord>((seed.documents ?? []).map((d) => [d.id, d]));
  const analysisRuns = new Map<string, AnalysisRun[]>();
  const predictionsByRun = new Map<string, Prediction[]>();
  const evidenceByPrediction = new Map<string, Evidence[]>();
  const recommendationsByRun = new Map<string, Recommendation[]>();

  for (const event of seed.logEvents ?? []) {
    const list = logEvents.get(event.incidentId) ?? [];
    list.push(event);
    logEvents.set(event.incidentId, list);
  }
  for (const event of seed.metricEvents ?? []) {
    const list = metricEvents.get(event.incidentId) ?? [];
    list.push(event);
    metricEvents.set(event.incidentId, list);
  }

  return {
    async listIncidents() {
      return [...incidents.values()];
    },
    async getIncident(id) {
      return incidents.get(id) ?? null;
    },
    async upsertIncident(incident) {
      incidents.set(incident.id, incident);
    },

    async listServices() {
      return services;
    },
    async listServiceDependencies() {
      return serviceDependencies;
    },

    async listLogEvents(incidentId) {
      return logEvents.get(incidentId) ?? [];
    },
    async listMetricEvents(incidentId) {
      return metricEvents.get(incidentId) ?? [];
    },
    async insertLogEvents(events) {
      for (const event of events) {
        const list = logEvents.get(event.incidentId) ?? [];
        list.push(event);
        logEvents.set(event.incidentId, list);
      }
    },
    async insertMetricEvents(events) {
      for (const event of events) {
        const list = metricEvents.get(event.incidentId) ?? [];
        list.push(event);
        metricEvents.set(event.incidentId, list);
      }
    },

    async listDocuments() {
      return [...documents.values()];
    },
    async upsertDocument(document) {
      documents.set(document.id, document);
    },

    async saveAnalysisRun(run) {
      const list = analysisRuns.get(run.incidentId) ?? [];
      list.push(run);
      analysisRuns.set(run.incidentId, list);
    },
    async savePredictions(predictions) {
      for (const prediction of predictions) {
        const list = predictionsByRun.get(prediction.analysisRunId) ?? [];
        list.push(prediction);
        predictionsByRun.set(prediction.analysisRunId, list);
      }
    },
    async saveEvidence(evidenceList) {
      for (const evidence of evidenceList) {
        const list = evidenceByPrediction.get(evidence.predictionId) ?? [];
        list.push(evidence);
        evidenceByPrediction.set(evidence.predictionId, list);
      }
    },
    async saveRecommendations(recommendations) {
      for (const recommendation of recommendations) {
        const list = recommendationsByRun.get(recommendation.analysisRunId) ?? [];
        list.push(recommendation);
        recommendationsByRun.set(recommendation.analysisRunId, list);
      }
    },

    async getLatestAnalysisRun(incidentId) {
      const list = analysisRuns.get(incidentId) ?? [];
      if (list.length === 0) return null;
      return list.reduce((latest, run) => (run.createdAt > latest.createdAt ? run : latest));
    },
    async getPredictionsForRun(analysisRunId) {
      return predictionsByRun.get(analysisRunId) ?? [];
    },
    async getEvidenceForPrediction(predictionId) {
      return evidenceByPrediction.get(predictionId) ?? [];
    },
    async getRecommendationsForRun(analysisRunId) {
      return recommendationsByRun.get(analysisRunId) ?? [];
    },
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/db/memory-repository.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/db/repository.ts lib/db/memory-repository.ts tests/db/memory-repository.test.ts
git commit -m "feat: add Repository interface and in-memory implementation"
```

---

### Task 4: Supabase migrations + Supabase repository + repository factory

**Files:**
- Create: `supabase/migrations/0001_init.sql`
- Create: `lib/db/supabase-repository.ts`
- Create: `lib/db/index.ts`
- Test: `tests/db/index.test.ts`

**Interfaces:**
- Consumes: `Repository` (Task 3), `Incident` etc. types (Task 2).
- Produces: `getRepository(): Repository` — the single entry point every API route uses to get a repository instance.

- [ ] **Step 1: Write `supabase/migrations/0001_init.sql`**

```sql
create extension if not exists vector;

create table if not exists services (
  id text primary key,
  name text not null,
  type text not null
);

create table if not exists service_dependencies (
  source_service text not null references services(id),
  target_service text not null references services(id),
  primary key (source_service, target_service)
);

create table if not exists incidents (
  id text primary key,
  title text not null,
  severity text not null check (severity in ('sev1','sev2','sev3','sev4')),
  status text not null check (status in ('open','investigating','resolved')),
  started_at timestamptz not null,
  resolved_at timestamptz,
  root_cause_truth text not null,
  affected_services text[] not null default '{}'
);

create table if not exists log_events (
  id text primary key,
  incident_id text not null references incidents(id) on delete cascade,
  timestamp timestamptz not null,
  service text not null,
  level text not null check (level in ('debug','info','warn','error','fatal')),
  template text not null,
  count integer not null default 1
);
create index if not exists log_events_incident_idx on log_events(incident_id);

create table if not exists metric_events (
  id text primary key,
  incident_id text not null references incidents(id) on delete cascade,
  timestamp timestamptz not null,
  service text not null,
  metric text not null,
  value double precision not null
);
create index if not exists metric_events_incident_idx on metric_events(incident_id);

create table if not exists documents (
  id text primary key,
  title text not null,
  body text not null,
  doc_type text not null check (doc_type in ('runbook','service_description','postmortem')),
  embedding vector(768)
);
create index if not exists documents_embedding_idx on documents using ivfflat (embedding vector_cosine_ops);

create table if not exists analysis_runs (
  id text primary key,
  incident_id text not null references incidents(id) on delete cascade,
  model text not null,
  prompt_version text not null,
  latency_ms integer not null,
  status text not null check (status in ('succeeded','failed')),
  created_at timestamptz not null default now()
);
create index if not exists analysis_runs_incident_idx on analysis_runs(incident_id);

create table if not exists predictions (
  id text primary key,
  analysis_run_id text not null references analysis_runs(id) on delete cascade,
  root_cause text not null,
  rank integer not null,
  confidence double precision not null
);
create index if not exists predictions_run_idx on predictions(analysis_run_id);

create table if not exists evidence (
  id text primary key,
  prediction_id text not null references predictions(id) on delete cascade,
  source_type text not null check (source_type in ('log_event','metric_event','document','incident')),
  source_id text not null,
  support_type text not null check (support_type in ('supporting','contradicting'))
);
create index if not exists evidence_prediction_idx on evidence(prediction_id);

create table if not exists recommendations (
  id text primary key,
  analysis_run_id text not null references analysis_runs(id) on delete cascade,
  action text not null,
  priority integer not null
);
create index if not exists recommendations_run_idx on recommendations(analysis_run_id);
```

- [ ] **Step 2: Write `lib/db/supabase-repository.ts`**

```typescript
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Repository } from "@/lib/db/repository";
import type {
  Incident,
  Service,
  ServiceDependency,
  LogEvent,
  MetricEvent,
  DocumentRecord,
  AnalysisRun,
  Prediction,
  Evidence,
  Recommendation,
} from "@/lib/types";

function incidentFromRow(row: Record<string, unknown>): Incident {
  return {
    id: row.id as string,
    title: row.title as string,
    severity: row.severity as Incident["severity"],
    status: row.status as Incident["status"],
    startedAt: row.started_at as string,
    resolvedAt: (row.resolved_at as string | null) ?? null,
    rootCauseTruth: row.root_cause_truth as string,
    affectedServices: (row.affected_services as string[]) ?? [],
  };
}

export function createSupabaseRepository(url: string, serviceRoleKey: string): Repository {
  const client: SupabaseClient = createClient(url, serviceRoleKey);

  return {
    async listIncidents() {
      const { data, error } = await client.from("incidents").select("*");
      if (error) throw error;
      return (data ?? []).map(incidentFromRow);
    },
    async getIncident(id) {
      const { data, error } = await client.from("incidents").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? incidentFromRow(data) : null;
    },
    async upsertIncident(incident: Incident) {
      const { error } = await client.from("incidents").upsert({
        id: incident.id,
        title: incident.title,
        severity: incident.severity,
        status: incident.status,
        started_at: incident.startedAt,
        resolved_at: incident.resolvedAt,
        root_cause_truth: incident.rootCauseTruth,
        affected_services: incident.affectedServices,
      });
      if (error) throw error;
    },

    async listServices() {
      const { data, error } = await client.from("services").select("*");
      if (error) throw error;
      return (data ?? []) as Service[];
    },
    async listServiceDependencies() {
      const { data, error } = await client.from("service_dependencies").select("*");
      if (error) throw error;
      return (data ?? []).map((row: Record<string, unknown>) => ({
        sourceService: row.source_service as string,
        targetService: row.target_service as string,
      }));
    },

    async listLogEvents(incidentId) {
      const { data, error } = await client.from("log_events").select("*").eq("incident_id", incidentId);
      if (error) throw error;
      return (data ?? []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        incidentId: row.incident_id as string,
        timestamp: row.timestamp as string,
        service: row.service as string,
        level: row.level as LogEvent["level"],
        template: row.template as string,
        count: row.count as number,
      }));
    },
    async listMetricEvents(incidentId) {
      const { data, error } = await client.from("metric_events").select("*").eq("incident_id", incidentId);
      if (error) throw error;
      return (data ?? []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        incidentId: row.incident_id as string,
        timestamp: row.timestamp as string,
        service: row.service as string,
        metric: row.metric as string,
        value: row.value as number,
      }));
    },
    async insertLogEvents(events: LogEvent[]) {
      if (events.length === 0) return;
      const { error } = await client.from("log_events").insert(
        events.map((e) => ({
          id: e.id,
          incident_id: e.incidentId,
          timestamp: e.timestamp,
          service: e.service,
          level: e.level,
          template: e.template,
          count: e.count,
        })),
      );
      if (error) throw error;
    },
    async insertMetricEvents(events: MetricEvent[]) {
      if (events.length === 0) return;
      const { error } = await client.from("metric_events").insert(
        events.map((e) => ({
          id: e.id,
          incident_id: e.incidentId,
          timestamp: e.timestamp,
          service: e.service,
          metric: e.metric,
          value: e.value,
        })),
      );
      if (error) throw error;
    },

    async listDocuments() {
      const { data, error } = await client.from("documents").select("*");
      if (error) throw error;
      return (data ?? []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        title: row.title as string,
        body: row.body as string,
        docType: row.doc_type as DocumentRecord["docType"],
        embedding: (row.embedding as number[] | null) ?? null,
      }));
    },
    async upsertDocument(document: DocumentRecord) {
      const { error } = await client.from("documents").upsert({
        id: document.id,
        title: document.title,
        body: document.body,
        doc_type: document.docType,
        embedding: document.embedding,
      });
      if (error) throw error;
    },

    async saveAnalysisRun(run: AnalysisRun) {
      const { error } = await client.from("analysis_runs").insert({
        id: run.id,
        incident_id: run.incidentId,
        model: run.model,
        prompt_version: run.promptVersion,
        latency_ms: run.latencyMs,
        status: run.status,
        created_at: run.createdAt,
      });
      if (error) throw error;
    },
    async savePredictions(predictions: Prediction[]) {
      if (predictions.length === 0) return;
      const { error } = await client.from("predictions").insert(
        predictions.map((p) => ({
          id: p.id,
          analysis_run_id: p.analysisRunId,
          root_cause: p.rootCause,
          rank: p.rank,
          confidence: p.confidence,
        })),
      );
      if (error) throw error;
    },
    async saveEvidence(evidenceList: Evidence[]) {
      if (evidenceList.length === 0) return;
      const { error } = await client.from("evidence").insert(
        evidenceList.map((e) => ({
          id: e.id,
          prediction_id: e.predictionId,
          source_type: e.sourceType,
          source_id: e.sourceId,
          support_type: e.supportType,
        })),
      );
      if (error) throw error;
    },
    async saveRecommendations(recommendations: Recommendation[]) {
      if (recommendations.length === 0) return;
      const { error } = await client.from("recommendations").insert(
        recommendations.map((r) => ({
          id: r.id,
          analysis_run_id: r.analysisRunId,
          action: r.action,
          priority: r.priority,
        })),
      );
      if (error) throw error;
    },

    async getLatestAnalysisRun(incidentId) {
      const { data, error } = await client
        .from("analysis_runs")
        .select("*")
        .eq("incident_id", incidentId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id,
        incidentId: data.incident_id,
        model: data.model,
        promptVersion: data.prompt_version,
        latencyMs: data.latency_ms,
        status: data.status,
        createdAt: data.created_at,
      };
    },
    async getPredictionsForRun(analysisRunId) {
      const { data, error } = await client.from("predictions").select("*").eq("analysis_run_id", analysisRunId);
      if (error) throw error;
      return (data ?? []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        analysisRunId: row.analysis_run_id as string,
        rootCause: row.root_cause as string,
        rank: row.rank as number,
        confidence: row.confidence as number,
      }));
    },
    async getEvidenceForPrediction(predictionId) {
      const { data, error } = await client.from("evidence").select("*").eq("prediction_id", predictionId);
      if (error) throw error;
      return (data ?? []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        predictionId: row.prediction_id as string,
        sourceType: row.source_type as Evidence["sourceType"],
        sourceId: row.source_id as string,
        supportType: row.support_type as Evidence["supportType"],
      }));
    },
    async getRecommendationsForRun(analysisRunId) {
      const { data, error } = await client.from("recommendations").select("*").eq("analysis_run_id", analysisRunId);
      if (error) throw error;
      return (data ?? []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        analysisRunId: row.analysis_run_id as string,
        action: row.action as string,
        priority: row.priority as number,
      }));
    },
  };
}
```

- [ ] **Step 3: Write `lib/db/index.ts`**

```typescript
import type { Repository } from "@/lib/db/repository";
import { createMemoryRepository } from "@/lib/db/memory-repository";
import { createSupabaseRepository } from "@/lib/db/supabase-repository";

let cached: Repository | null = null;

export function getRepository(): Repository {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  cached = url && key ? createSupabaseRepository(url, key) : createMemoryRepository();
  return cached;
}

export function resetRepositoryForTests(): void {
  cached = null;
}
```

- [ ] **Step 4: Write the test**

```typescript
// tests/db/index.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getRepository, resetRepositoryForTests } from "@/lib/db/index";

describe("getRepository", () => {
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    resetRepositoryForTests();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterEach(() => {
    if (originalUrl) process.env.SUPABASE_URL = originalUrl;
    if (originalKey) process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    resetRepositoryForTests();
  });

  it("defaults to an in-memory repository with no Supabase env vars", async () => {
    const repo = getRepository();
    expect(await repo.listIncidents()).toEqual([]);
  });

  it("returns the same cached instance on repeated calls", () => {
    expect(getRepository()).toBe(getRepository());
  });
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/db/index.test.ts`
Expected: PASS

- [ ] **Step 6: Verify typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0001_init.sql lib/db/supabase-repository.ts lib/db/index.ts tests/db/index.test.ts
git commit -m "feat: add Supabase migration, Supabase repository, and repository factory"
```

---

### Task 5: Incident CRUD API routes

**Files:**
- Create: `lib/security/validation.ts`
- Create: `app/api/incidents/route.ts`
- Create: `app/api/incidents/[id]/route.ts`
- Test: `tests/api/incidents.test.ts`

**Interfaces:**
- Consumes: `getRepository()` (Task 4), `Incident` type (Task 2).
- Produces: `GET /api/incidents`, `GET /api/incidents/:id`; `incidentQuerySchema` Zod schema reused by later API-route tasks (item 17 of the design doc).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/api/incidents.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { resetRepositoryForTests, getRepository } from "@/lib/db/index";
import { GET as listIncidents } from "@/app/api/incidents/route";
import { GET as getIncident } from "@/app/api/incidents/[id]/route";

describe("/api/incidents", () => {
  beforeEach(async () => {
    resetRepositoryForTests();
    await getRepository().upsertIncident({
      id: "INC-0001",
      title: "DB connection pool exhaustion",
      severity: "sev1",
      status: "resolved",
      startedAt: "2026-01-01T00:00:00.000Z",
      resolvedAt: null,
      rootCauseTruth: "db_connection_pool_exhaustion",
      affectedServices: ["payment-service"],
    });
  });

  it("GET /api/incidents returns the seeded incident", async () => {
    const response = await listIncidents(new Request("http://localhost/api/incidents"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.incidents).toHaveLength(1);
    expect(body.incidents[0].id).toBe("INC-0001");
  });

  it("GET /api/incidents/:id returns 200 for a known incident", async () => {
    const response = await getIncident(new Request("http://localhost/api/incidents/INC-0001"), {
      params: { id: "INC-0001" },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.incident.title).toBe("DB connection pool exhaustion");
  });

  it("GET /api/incidents/:id returns 404 for an unknown incident", async () => {
    const response = await getIncident(new Request("http://localhost/api/incidents/missing"), {
      params: { id: "missing" },
    });
    expect(response.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api/incidents.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `lib/security/validation.ts`**

```typescript
import { z } from "zod";

export const incidentIdSchema = z.string().min(1).max(64);

export const routeParamsSchema = z.object({
  params: z.object({ id: incidentIdSchema }),
});
```

- [ ] **Step 4: Write `app/api/incidents/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/index";

export async function GET(_request: Request) {
  const repository = getRepository();
  const incidents = await repository.listIncidents();
  return NextResponse.json({ incidents });
}
```

- [ ] **Step 5: Write `app/api/incidents/[id]/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/index";
import { incidentIdSchema } from "@/lib/security/validation";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const parsed = incidentIdSchema.safeParse(params.id);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid incident id" }, { status: 400 });
  }

  const repository = getRepository();
  const incident = await repository.getIncident(parsed.data);
  if (!incident) {
    return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  }
  return NextResponse.json({ incident });
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/api/incidents.test.ts`
Expected: PASS

- [ ] **Step 7: Verify full suite, typecheck, and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add lib/security/validation.ts app/api/incidents tests/api/incidents.test.ts
git commit -m "feat: add incident list and detail API routes"
```

---

## Definition of done for Phase 1

- [ ] `npm test` passes with all tests from Tasks 2-5.
- [ ] `npm run typecheck` passes.
- [ ] `npm run build` succeeds.
- [ ] `npm run dev` serves the home page without a Supabase/Gemini account configured.
- [ ] Every task above has its own commit on `main`.
