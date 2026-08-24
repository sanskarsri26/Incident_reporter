# Multi-User Auth + Private Uploaded Incidents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Supabase Auth (email+password) and let each user upload their own error log file as a private incident only they can see, while the existing 56 seeded incidents stay visible to everyone.

**Architecture:** `incidents.owner_id` (nullable uuid) distinguishes shared (`null`) from private (a user id) incidents; the `Repository` interface's `listIncidents`/`getIncident` take an `ownerId` and filter in application code (not RLS, matching the project's existing service-role-key-only pattern). Auth is a new `AuthProvider` abstraction (real-vs-mock, mirroring the existing `LLMProvider`/`EmbeddingProvider`/`RateLimiter` providers) driven entirely through this app's own `/api/auth/*` routes — never a direct browser-to-Supabase call, because the CSP's `connect-src 'self'` would silently block one.

**Tech Stack:** Next.js 16 App Router, `@supabase/ssr` 0.12.4 (new), existing `@supabase/supabase-js`, zod, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-23-multi-user-auth-design.md`

## Global Constraints

- Every client-side `fetch()` must target only this app's own `/api/*` routes — never call Supabase directly from the browser (CSP `connect-src 'self'`; see spec's Auth section for why).
- Authorization (who can see which incident) is enforced in application code via `ownerId` parameters, never via RLS policies — matches every other table in this project (zero RLS policies, service-role key server-side only).
- `getIncident(id, ownerId)` returns `null` for both "doesn't exist" and "exists, not yours" — never a distinguishable error, so incident ids can't be probed to learn what exists.
- Every new provider (auth) must work with zero external accounts configured, exactly like the LLM/embedding/rate-limiter/repository providers already do — a mock in-memory implementation is not optional polish, it's how this project's local dev and CI already work everywhere else.
- Route handlers must stay testable by constructing a plain `Request` and calling the exported handler function directly (the pattern every existing `tests/api/*.test.ts` file uses) — `next/headers`'s `cookies()` cannot be used inside route handler bodies, since it throws outside Next's own request-scoped invocation. Server Components (which do have real `next/headers` access) are the only place it's used.

---

### Task 1: Data model — `owner_id` + nullable `root_cause_truth`

**Files:**
- Create: `supabase/migrations/0003_auth.sql`
- Modify: `lib/types.ts`
- Modify: `lib/db/repository.ts`
- Modify: `lib/db/memory-repository.ts`
- Modify: `lib/db/supabase-repository.ts`
- Modify: `tests/db/fake-supabase-client.ts`
- Modify: `scripts/generate-incidents.ts`
- Test: `tests/db/memory-repository.test.ts`
- Test: `tests/db/supabase-repository.test.ts`

**Interfaces:**
- Produces: `Repository.listIncidents(ownerId: string | null): Promise<Incident[]>`, `Repository.getIncident(id: string, ownerId: string | null): Promise<Incident | null>` — every later task's route/page changes call these with the real signature.
- Produces: `Incident.ownerId: string | null`, `Incident.rootCauseTruth: string | null`.

- [ ] **Step 1: Write the failing repository tests**

Add to `tests/db/memory-repository.test.ts` (after the existing `sampleIncident` const, add a second one and new tests):

```typescript
const otherOwnerIncident: Incident = {
  ...sampleIncident,
  id: "INC-0002",
  ownerId: "user-a",
  rootCauseTruth: null,
};

// ...inside describe("createMemoryRepository", () => { ... }), add:

it("listIncidents(null) returns only shared incidents (ownerId: null)", async () => {
  const repo = createMemoryRepository({ incidents: [sampleIncident, otherOwnerIncident] });
  expect(await repo.listIncidents(null)).toEqual([sampleIncident]);
});

it("listIncidents(ownerId) returns shared incidents plus that owner's own", async () => {
  const repo = createMemoryRepository({
    incidents: [sampleIncident, otherOwnerIncident, { ...otherOwnerIncident, id: "INC-0003", ownerId: "user-b" }],
  });
  const result = await repo.listIncidents("user-a");
  expect(result.map((i) => i.id).sort()).toEqual(["INC-0001", "INC-0002"]);
});

it("getIncident returns null (not the row) when the incident belongs to a different owner", async () => {
  const repo = createMemoryRepository({ incidents: [otherOwnerIncident] });
  expect(await repo.getIncident("INC-0002", null)).toBeNull();
  expect(await repo.getIncident("INC-0002", "user-b")).toBeNull();
  expect(await repo.getIncident("INC-0002", "user-a")).toEqual(otherOwnerIncident);
});

it("getIncident(id, null) returns a shared incident", async () => {
  const repo = createMemoryRepository({ incidents: [sampleIncident] });
  expect(await repo.getIncident("INC-0001", null)).toEqual(sampleIncident);
});
```

Update the existing `sampleIncident` const at the top of the file to include `ownerId: null`:
```typescript
const sampleIncident: Incident = {
  id: "INC-0001",
  title: "DB connection pool exhaustion",
  severity: "sev1",
  status: "resolved",
  startedAt: "2026-01-01T00:00:00.000Z",
  resolvedAt: null,
  rootCauseTruth: "db_connection_pool_exhaustion",
  affectedServices: ["payment-service"],
  ownerId: null,
};
```
Update every existing call in that file that calls `repo.listIncidents()` or `repo.getIncident("...")` with no arguments to pass `null` as the argument (e.g. `repo.listIncidents(null)`, `repo.getIncident("INC-0001", null)`, `repo.getIncident("missing", null)`).

Add the mirrored tests to `tests/db/supabase-repository.test.ts`: update `sampleIncident` there the same way (`ownerId: null` added), update every `r.listIncidents()` / `r.getIncident(...)` call to pass the new second argument, and add:

```typescript
it("listIncidents(ownerId) returns shared incidents plus that owner's own, filtering out other owners'", async () => {
  const r = repo();
  await r.upsertIncident(sampleIncident);
  await r.upsertIncident({ ...sampleIncident, id: "INC-0002", ownerId: "user-a", rootCauseTruth: null });
  await r.upsertIncident({ ...sampleIncident, id: "INC-0003", ownerId: "user-b", rootCauseTruth: null });

  expect((await r.listIncidents("user-a")).map((i) => i.id).sort()).toEqual(["INC-0001", "INC-0002"]);
  expect((await r.listIncidents(null)).map((i) => i.id)).toEqual(["INC-0001"]);
});

it("getIncident returns null when the incident belongs to a different owner", async () => {
  const r = repo();
  await r.upsertIncident({ ...sampleIncident, id: "INC-0002", ownerId: "user-a", rootCauseTruth: null });
  expect(await r.getIncident("INC-0002", "user-b")).toBeNull();
  expect(await r.getIncident("INC-0002", "user-a")).toEqual({ ...sampleIncident, id: "INC-0002", ownerId: "user-a", rootCauseTruth: null });
});

it("round-trips a null root_cause_truth (an uploaded incident with no known ground truth)", async () => {
  const r = repo();
  const uploaded = { ...sampleIncident, id: "INC-0004", ownerId: "user-a", rootCauseTruth: null };
  await r.upsertIncident(uploaded);
  expect(await r.getIncident("INC-0004", "user-a")).toEqual(uploaded);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/db/memory-repository.test.ts tests/db/supabase-repository.test.ts`
Expected: FAIL — `listIncidents`/`getIncident` don't accept an `ownerId` argument yet (TypeScript compile error under Vitest, or wrong-arity calls silently ignored and assertions failing).

- [ ] **Step 3: Migration**

Create `supabase/migrations/0003_auth.sql`:
```sql
alter table incidents add column owner_id uuid references auth.users(id);
alter table incidents alter column root_cause_truth drop not null;
create index if not exists incidents_owner_idx on incidents(owner_id);
```

- [ ] **Step 4: Update `lib/types.ts`**

```typescript
export interface Incident {
  id: string;
  title: string;
  severity: Severity;
  status: IncidentStatus;
  startedAt: string;
  resolvedAt: string | null;
  rootCauseTruth: string | null;
  affectedServices: string[];
  ownerId: string | null;
}
```

- [ ] **Step 5: Update `lib/db/repository.ts`**

```typescript
export interface Repository {
  listIncidents(ownerId: string | null): Promise<Incident[]>;
  getIncident(id: string, ownerId: string | null): Promise<Incident | null>;
  upsertIncident(incident: Incident): Promise<void>;
  // ...rest unchanged...
}
```

- [ ] **Step 6: Update `lib/db/memory-repository.ts`**

```typescript
async listIncidents(ownerId) {
  return [...incidents.values()].filter((i) => i.ownerId === null || i.ownerId === ownerId);
},
async getIncident(id, ownerId) {
  const incident = incidents.get(id) ?? null;
  if (!incident) return null;
  if (incident.ownerId !== null && incident.ownerId !== ownerId) return null;
  return incident;
},
```

- [ ] **Step 7: Update `lib/db/supabase-repository.ts`**

`incidentFromRow` gets two field changes:
```typescript
function incidentFromRow(row: Record<string, unknown>): Incident {
  return {
    id: row.id as string,
    title: row.title as string,
    severity: row.severity as Incident["severity"],
    status: row.status as Incident["status"],
    startedAt: row.started_at as string,
    resolvedAt: (row.resolved_at as string | null) ?? null,
    rootCauseTruth: (row.root_cause_truth as string | null) ?? null,
    affectedServices: (row.affected_services as string[]) ?? [],
    ownerId: (row.owner_id as string | null) ?? null,
  };
}
```

`listIncidents`/`getIncident`/`upsertIncident` in `createSupabaseRepositoryFromClient`:
```typescript
async listIncidents(ownerId) {
  const query = client.from("incidents").select("*");
  const { data, error } = ownerId
    ? await query.or(`owner_id.is.null,owner_id.eq.${ownerId}`)
    : await query.is("owner_id", null);
  if (error) throw error;
  return (data ?? []).map(incidentFromRow);
},
async getIncident(id, ownerId) {
  const { data, error } = await client.from("incidents").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const incident = incidentFromRow(data);
  if (incident.ownerId !== null && incident.ownerId !== ownerId) return null;
  return incident;
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
    owner_id: incident.ownerId,
  });
  if (error) throw error;
},
```
`getIncident` fetches the row unconditionally and filters in JS (like the memory repository) rather than pushing the ownership check into the query — simpler, and `id` is already a primary-key equality filter so there's at most one row either way. `listIncidents` uses `.or()` for the two-owner case since PostgREST doesn't have a boolean-OR-of-two-different-filters shorthand otherwise, and `.is("owner_id", null)` for the logged-out case (a bare `.eq("owner_id", null)` would be wrong — SQL `= NULL` never matches).

- [ ] **Step 8: Update `tests/db/fake-supabase-client.ts` to support `.or()` and `.is()`**

Add two methods to `FakeQueryBuilder` and handle them in the filter pass:
```typescript
private orClause: string | undefined;

or(clause: string): this {
  this.orClause = clause;
  return this;
}

is(column: string, value: null): this {
  this.filters.push([column, value]);
  return this;
}
```
In `then()`, change the `results = state.rows.filter(...)` line to also honor `orClause` when present. Replace:
```typescript
let results = state.rows.filter((row) => this.filters.every(([column, value]) => row[column] === value));
```
with:
```typescript
let results = state.rows.filter((row) => {
  if (!this.filters.every(([column, value]) => row[column] === value)) return false;
  if (!this.orClause) return true;
  // Only ever used for "owner_id.is.null,owner_id.eq.<id>" in this
  // project -- a real .or() parser is out of scope for a test double.
  return this.orClause.split(",").some((part) => {
    const [, op, value] = part.split(".");
    if (op === "is") return row.owner_id === null;
    if (op === "eq") return row.owner_id === value;
    return false;
  });
});
```
(`eq` already exists and works unchanged for `.is()`'s `null` case since `row[column] === value` handles `=== null` correctly.)

- [ ] **Step 9: Update `scripts/generate-incidents.ts`**

Add `ownerId: null` to the `incident` object literal (the one containing `rootCauseTruth: fault`):
```typescript
const incident: Incident = {
  id: incidentId,
  title,
  severity,
  status,
  startedAt: startedAt.toISOString(),
  resolvedAt: status === "resolved" ? resolvedAt.toISOString() : null,
  rootCauseTruth: fault,
  affectedServices: faultResult.manifest.affectedServices,
  ownerId: null,
};
```

- [ ] **Step 10: Add `ownerId: null` to every other `Incident` literal in the test suite**

`Incident.ownerId` is now a required field (Step 4). Five test files outside `tests/db/` construct `Incident` literals directly and need the same one-line addition — these test pure functions that never filter on ownership, so skipping this step wouldn't break anything at runtime, but it would leave `npm run typecheck` dirty for the rest of the branch. Fix it now while the type change is fresh, the same way Step 1 already fixed `tests/db/*.test.ts`:

- `tests/investigation/pipeline.test.ts` (the `const incident: Incident = {...}` around line 7) — add `ownerId: null,` after `affectedServices: [...]`.
- `tests/investigation/summary.test.ts` (same shape, around line 5) — same addition.
- `tests/investigation/evidence-catalog.test.ts` — the `Incident` literal nested inside `similarIncidents[0].incident` (around line 23) — same addition.
- `tests/retrieval/similar-incidents.test.ts` — the `incident(id, rootCauseTruth)` helper function's returned object (around line 23) — add `ownerId: null,` to the returned literal.
- `tests/types.test.ts` — the `const incident: Incident = {...}` in the "satisfies the Incident type" test (around line 11) — same addition.

Four more files — `tests/api/incidents.test.ts`, `tests/api/investigate.test.ts`, `tests/api/similar.test.ts`, `tests/api/timeline.test.ts` — also construct `Incident` literals (in `beforeEach` blocks or module-level fixtures) that need the same fix, but leave those to Task 3 Step 1: those four go through `Repository`'s ownership filter once Task 3 wires real callers through, so fixing them belongs with the task that adds the ownership-visibility tests exercising that exact filter, not here.

- [ ] **Step 11: Run tests to verify they pass**

Run: `npm test -- tests/db/memory-repository.test.ts tests/db/supabase-repository.test.ts`
Expected: PASS. Then run the full suite (`npm test`) — it should also PASS: Vitest transpiles TypeScript with esbuild and does not type-check (`vitest.config.ts` has no typecheck plugin configured), so the 8 non-test call sites still calling `listIncidents()`/`getIncident(id)` with the old (now-missing) argument aren't caught at this layer, and at runtime `ownerId` is simply `undefined` there — which happens to behave correctly by coincidence (every seeded incident has `ownerId: null` after Step 9, and `i.ownerId === null || i.ownerId === undefined` still matches only the shared catalog, exactly like passing `null` explicitly would). Do **not** touch those 8 call sites in this task — that's Task 3's explicit job, wiring in the real signed-in user instead of the accidental `undefined`.

Run: `npm run typecheck` — this **will** still fail, but now only on the 8 route/page call sites from the grep in this task's file list (not on any test file). That's expected and correct: it's the compiler enumerating exactly the work Task 3 does. Do not silence or work around it in this task, and do not let it regress past those 8 known call sites — if `typecheck` reports errors anywhere else, Step 10 missed a file.

- [ ] **Step 12: Regenerate the incident dataset**

Run: `npm run gen:incidents`
Expected: regenerates `data/incident-manifests/*.json` with `ownerId: null` on every incident. Then run: `npm test` to confirm `tests/scripts/seed.test.ts` and the integration tests still pass against the regenerated data.

- [ ] **Step 13: Commit**

```bash
git add supabase/migrations/0003_auth.sql lib/types.ts lib/db/repository.ts lib/db/memory-repository.ts lib/db/supabase-repository.ts tests/db/fake-supabase-client.ts tests/db/memory-repository.test.ts tests/db/supabase-repository.test.ts scripts/generate-incidents.ts data/incident-manifests tests/investigation/pipeline.test.ts tests/investigation/summary.test.ts tests/investigation/evidence-catalog.test.ts tests/retrieval/similar-incidents.test.ts tests/types.test.ts
git commit -m "feat: add owner_id to incidents and make root_cause_truth nullable"
```

---

### Task 2: Auth infrastructure (provider abstraction, API routes, pages, middleware)

**Files:**
- Create: `lib/auth/types.ts`
- Create: `lib/auth/cookie-adapter.ts`
- Create: `lib/auth/mock-auth-provider.ts`
- Create: `lib/auth/supabase-auth-provider.ts`
- Create: `lib/auth/index.ts`
- Create: `lib/auth/request-context.ts`
- Create: `lib/auth/server-component-context.ts`
- Create: `app/api/auth/signup/route.ts`
- Create: `app/api/auth/login/route.ts`
- Create: `app/api/auth/logout/route.ts`
- Create: `app/login/page.tsx`
- Create: `app/signup/page.tsx`
- Create: `components/SignOutButton.tsx`
- Modify: `components/NavBar.tsx`
- Create: `middleware.ts`
- Modify: `next.config.mjs` (comment only — it currently states "no proxy/middleware")
- Modify: `package.json` (add `@supabase/ssr`)
- Test: `tests/auth/mock-auth-provider.test.ts`
- Test: `tests/api/auth-login.test.ts`
- Test: `tests/api/auth-signup.test.ts`
- Test: `tests/api/auth-logout.test.ts`
- Test: `tests/components/NavBar.test.tsx`
- Test: `tests/components/LoginForm.test.tsx`
- Test: `tests/components/SignupForm.test.tsx`

**Interfaces:**
- Consumes: nothing from Task 1 directly (this task is additive infrastructure), but Task 3 will consume `getUserFromRequest(request): Promise<{provider stuff}>` and `getCurrentUser(): Promise<AuthUser | null>` produced here.
- Produces:
  - `AuthUser = { id: string; email: string | null }`
  - `AuthProvider = { name: string; signUp(email, password): Promise<AuthResult>; signInWithPassword(email, password): Promise<AuthResult>; signOut(): Promise<void>; getUser(): Promise<AuthUser | null> }` where `AuthResult = { user: AuthUser | null; error: string | null }`
  - `getAuthProviderForRequest(request: Request): { provider: AuthProvider; takeSetCookieHeaders(): string[] }` (route handlers)
  - `getCurrentUser(): Promise<AuthUser | null>` (Server Components)

- [ ] **Step 1: Install `@supabase/ssr`**

```bash
npm install @supabase/ssr@0.12.4
```

- [ ] **Step 2: Write the failing test for the mock auth provider**

Create `tests/auth/mock-auth-provider.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { createMockAuthProvider, resetMockAuthProviderForTests } from "@/lib/auth/mock-auth-provider";
import { createMemoryCookieAdapter } from "./memory-cookie-adapter";

beforeEach(() => {
  resetMockAuthProviderForTests();
});

describe("mock auth provider", () => {
  it("signUp creates a user and sets a session cookie", async () => {
    const cookies = createMemoryCookieAdapter();
    const provider = createMockAuthProvider(cookies.adapter);

    const result = await provider.signUp("a@example.com", "password123");

    expect(result.error).toBeNull();
    expect(result.user?.email).toBe("a@example.com");
    expect(cookies.setCookies.some((c) => c.name === "mock-session")).toBe(true);
  });

  it("signUp rejects a duplicate email", async () => {
    const cookies = createMemoryCookieAdapter();
    await createMockAuthProvider(cookies.adapter).signUp("a@example.com", "password123");

    const second = createMockAuthProvider(createMemoryCookieAdapter().adapter);
    const result = await second.signUp("a@example.com", "different");
    expect(result.error).toBe("An account with this email already exists.");
    expect(result.user).toBeNull();
  });

  it("signInWithPassword succeeds with the correct password and fails with the wrong one", async () => {
    const signupCookies = createMemoryCookieAdapter();
    await createMockAuthProvider(signupCookies.adapter).signUp("a@example.com", "password123");

    const loginCookies = createMemoryCookieAdapter();
    const ok = await createMockAuthProvider(loginCookies.adapter).signInWithPassword("a@example.com", "password123");
    expect(ok.error).toBeNull();
    expect(ok.user?.email).toBe("a@example.com");

    const badCookies = createMemoryCookieAdapter();
    const bad = await createMockAuthProvider(badCookies.adapter).signInWithPassword("a@example.com", "wrong");
    expect(bad.error).toBe("Invalid login credentials");
    expect(bad.user).toBeNull();
  });

  it("getUser reads the session cookie set by signUp/signIn", async () => {
    const cookies = createMemoryCookieAdapter();
    const provider = createMockAuthProvider(cookies.adapter);
    await provider.signUp("a@example.com", "password123");

    // A second provider instance sharing the same cookie jar (simulating a
    // later request) should read the same session back.
    const laterCookies = createMemoryCookieAdapter();
    laterCookies.setCookies.push(...cookies.setCookies);
    laterCookies.adapter.getAll = () => laterCookies.setCookies.map((c) => ({ name: c.name, value: c.value }));
    const later = createMockAuthProvider(laterCookies.adapter);

    const user = await later.getUser();
    expect(user?.email).toBe("a@example.com");
  });

  it("getUser returns null when there is no session cookie", async () => {
    const cookies = createMemoryCookieAdapter();
    expect(await createMockAuthProvider(cookies.adapter).getUser()).toBeNull();
  });

  it("signOut clears the session cookie", async () => {
    const cookies = createMemoryCookieAdapter();
    const provider = createMockAuthProvider(cookies.adapter);
    await provider.signUp("a@example.com", "password123");
    await provider.signOut();

    const last = cookies.setCookies.at(-1);
    expect(last?.name).toBe("mock-session");
    expect(last?.options?.maxAge).toBe(0);
  });
});
```

Create the small test helper `tests/auth/memory-cookie-adapter.ts`:
```typescript
import type { CookieAdapter } from "@/lib/auth/cookie-adapter";

export function createMemoryCookieAdapter(): {
  adapter: CookieAdapter;
  setCookies: Array<{ name: string; value: string; options?: Record<string, unknown> }>;
} {
  const jar = new Map<string, string>();
  const setCookies: Array<{ name: string; value: string; options?: Record<string, unknown> }> = [];
  return {
    setCookies,
    adapter: {
      getAll() {
        return [...jar.entries()].map(([name, value]) => ({ name, value }));
      },
      setAll(cookies) {
        for (const { name, value, options } of cookies) {
          jar.set(name, value);
          setCookies.push({ name, value, options });
        }
      },
    },
  };
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- tests/auth/mock-auth-provider.test.ts`
Expected: FAIL — `lib/auth/mock-auth-provider.ts` and `lib/auth/cookie-adapter.ts` don't exist yet.

- [ ] **Step 4: Write `lib/auth/types.ts`**

```typescript
export interface AuthUser {
  id: string;
  email: string | null;
}

export interface AuthResult {
  user: AuthUser | null;
  error: string | null;
}

export interface AuthProvider {
  name: string;
  signUp(email: string, password: string): Promise<AuthResult>;
  signInWithPassword(email: string, password: string): Promise<AuthResult>;
  signOut(): Promise<void>;
  getUser(): Promise<AuthUser | null>;
}
```

- [ ] **Step 5: Write `lib/auth/cookie-adapter.ts`**

```typescript
export interface CookieAdapter {
  getAll(): Array<{ name: string; value: string }>;
  setAll(cookies: Array<{ name: string; value: string; options?: Record<string, unknown> }>): void;
}
```

- [ ] **Step 6: Write `lib/auth/mock-auth-provider.ts`**

```typescript
import { randomUUID, createHash } from "node:crypto";
import type { AuthProvider, AuthResult, AuthUser } from "@/lib/auth/types";
import type { CookieAdapter } from "@/lib/auth/cookie-adapter";

interface MockUser {
  id: string;
  email: string;
  // Demo/local-dev only -- this provider only ever activates when no real
  // Supabase project is configured (see lib/auth/index.ts), mirroring the
  // mock LLM/embedding providers' "deterministic, not a security control"
  // scope. A real deployment always uses createSupabaseAuthProvider.
  passwordHash: string;
}

const SESSION_COOKIE = "mock-session";

// Module-scoped, process-lifetime store -- same non-persistence caveat as
// the in-memory repository (lib/db/memory-repository.ts): fine for local
// dev/CI, resets on server restart.
let usersByEmail = new Map<string, MockUser>();

export function resetMockAuthProviderForTests(): void {
  usersByEmail = new Map();
}

function hash(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

export function createMockAuthProvider(cookies: CookieAdapter): AuthProvider {
  function setSession(userId: string | null): void {
    cookies.setAll([
      {
        name: SESSION_COOKIE,
        value: userId ?? "",
        options: { httpOnly: true, path: "/", maxAge: userId ? 60 * 60 * 24 * 30 : 0 },
      },
    ]);
  }

  function toAuthUser(user: MockUser): AuthUser {
    return { id: user.id, email: user.email };
  }

  return {
    name: "mock",

    async signUp(email, password): Promise<AuthResult> {
      const normalized = email.trim().toLowerCase();
      if (usersByEmail.has(normalized)) {
        return { user: null, error: "An account with this email already exists." };
      }
      const user: MockUser = { id: randomUUID(), email: normalized, passwordHash: hash(password) };
      usersByEmail.set(normalized, user);
      setSession(user.id);
      return { user: toAuthUser(user), error: null };
    },

    async signInWithPassword(email, password): Promise<AuthResult> {
      const normalized = email.trim().toLowerCase();
      const user = usersByEmail.get(normalized);
      if (!user || user.passwordHash !== hash(password)) {
        return { user: null, error: "Invalid login credentials" };
      }
      setSession(user.id);
      return { user: toAuthUser(user), error: null };
    },

    async signOut(): Promise<void> {
      setSession(null);
    },

    async getUser(): Promise<AuthUser | null> {
      const sessionCookie = cookies.getAll().find((c) => c.name === SESSION_COOKIE);
      if (!sessionCookie || !sessionCookie.value) return null;
      const user = [...usersByEmail.values()].find((u) => u.id === sessionCookie.value);
      return user ? toAuthUser(user) : null;
    },
  };
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test -- tests/auth/mock-auth-provider.test.ts`
Expected: PASS.

- [ ] **Step 8: Write `lib/auth/supabase-auth-provider.ts`** (real implementation, not directly unit-tested against a live project — exercised by the live smoke test in this task's final step instead, matching how `gemini-provider.ts` has no unit test hitting the real API)

```typescript
import { createServerClient } from "@supabase/ssr";
import type { AuthProvider, AuthResult } from "@/lib/auth/types";
import type { CookieAdapter } from "@/lib/auth/cookie-adapter";

export function createSupabaseAuthProvider(cookies: CookieAdapter, url: string, anonKey: string): AuthProvider {
  const client = createServerClient(url, anonKey, { cookies });

  function toResult(data: { user: { id: string; email?: string } | null }, error: { message: string } | null): AuthResult {
    if (error || !data.user) return { user: null, error: error?.message ?? "Authentication failed" };
    return { user: { id: data.user.id, email: data.user.email ?? null }, error: null };
  }

  return {
    name: "supabase",
    async signUp(email, password) {
      const { data, error } = await client.auth.signUp({ email, password });
      return toResult(data, error);
    },
    async signInWithPassword(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      return toResult(data, error);
    },
    async signOut() {
      await client.auth.signOut();
    },
    async getUser() {
      const { data, error } = await client.auth.getUser();
      if (error || !data.user) return null;
      return { id: data.user.id, email: data.user.email ?? null };
    },
  };
}
```

- [ ] **Step 9: Write `lib/auth/index.ts`**

```typescript
import type { AuthProvider } from "@/lib/auth/types";
import type { CookieAdapter } from "@/lib/auth/cookie-adapter";
import { createMockAuthProvider } from "@/lib/auth/mock-auth-provider";
import { createSupabaseAuthProvider } from "@/lib/auth/supabase-auth-provider";

export function getAuthProvider(cookies: CookieAdapter): AuthProvider {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anonKey) {
    return createSupabaseAuthProvider(cookies, url, anonKey);
  }
  return createMockAuthProvider(cookies);
}
```

- [ ] **Step 10: Write `lib/auth/request-context.ts`** (Route Handlers)

```typescript
import { parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import { getAuthProvider } from "@/lib/auth/index";
import type { AuthProvider } from "@/lib/auth/types";

// @supabase/ssr only needs {getAll, setAll} over cookies -- it has no
// hard dependency on next/headers. Building the adapter from the
// Request's own Cookie header (rather than next/headers's cookies())
// means these routes stay testable by constructing a plain Request and
// calling the exported handler directly, matching every existing
// tests/api/*.test.ts file. next/headers's cookies() only works inside
// Next's own request-scoped route invocation, which a direct function
// call in a test bypasses.
export function getAuthProviderForRequest(request: Request): {
  provider: AuthProvider;
  takeSetCookieHeaders(): string[];
} {
  const setCookieHeaders: string[] = [];
  const provider = getAuthProvider({
    getAll() {
      return parseCookieHeader(request.headers.get("cookie") ?? "");
    },
    setAll(cookies) {
      for (const { name, value, options } of cookies) {
        setCookieHeaders.push(serializeCookieHeader(name, value, options));
      }
    },
  });
  return { provider, takeSetCookieHeaders: () => setCookieHeaders };
}
```

- [ ] **Step 11: Write `lib/auth/server-component-context.ts`** (Server Components only)

```typescript
import { cookies } from "next/headers";
import { getAuthProvider } from "@/lib/auth/index";
import type { AuthUser } from "@/lib/auth/types";

export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const provider = getAuthProvider({
    getAll() {
      return cookieStore.getAll();
    },
    setAll(cookiesToSet) {
      try {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2]);
        }
      } catch {
        // Server Components can't set cookies -- middleware.ts refreshes
        // the session on the next navigation instead.
      }
    },
  });
  return provider.getUser();
}
```

- [ ] **Step 12: Write the failing API route tests**

Create `tests/api/auth-signup.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { resetMockAuthProviderForTests } from "@/lib/auth/mock-auth-provider";
import { resetRateLimiterForTests } from "@/lib/security/rate-limit";
import { POST as postSignup } from "@/app/api/auth/signup/route";

function request(body: unknown, ip = "203.0.113.5"): Request {
  return new Request("http://localhost/api/auth/signup", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/signup", () => {
  beforeEach(() => {
    resetMockAuthProviderForTests();
    resetRateLimiterForTests();
  });

  it("creates an account and sets a session cookie", async () => {
    const response = await postSignup(request({ email: "a@example.com", password: "password123" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("mock-session");
  });

  it("rejects an invalid email", async () => {
    const response = await postSignup(request({ email: "not-an-email", password: "password123" }));
    expect(response.status).toBe(400);
  });

  it("rejects a duplicate signup", async () => {
    await postSignup(request({ email: "a@example.com", password: "password123" }));
    const response = await postSignup(request({ email: "a@example.com", password: "password123" }, "203.0.113.6"));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("An account with this email already exists.");
  });

  it("rejects invalid JSON", async () => {
    const response = await postSignup(
      new Request("http://localhost/api/auth/signup", { method: "POST", body: "{not json" }),
    );
    expect(response.status).toBe(400);
  });
});
```

Create `tests/api/auth-login.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { resetMockAuthProviderForTests } from "@/lib/auth/mock-auth-provider";
import { resetRateLimiterForTests } from "@/lib/security/rate-limit";
import { POST as postSignup } from "@/app/api/auth/signup/route";
import { POST as postLogin } from "@/app/api/auth/login/route";

function request(path: string, body: unknown, ip = "203.0.113.5"): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    resetMockAuthProviderForTests();
    resetRateLimiterForTests();
  });

  it("logs in with the correct password", async () => {
    await postSignup(request("/api/auth/signup", { email: "a@example.com", password: "password123" }));
    const response = await postLogin(request("/api/auth/login", { email: "a@example.com", password: "password123" }, "203.0.113.6"));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("mock-session");
  });

  it("rejects the wrong password with 401", async () => {
    await postSignup(request("/api/auth/signup", { email: "a@example.com", password: "password123" }));
    const response = await postLogin(request("/api/auth/login", { email: "a@example.com", password: "wrong" }, "203.0.113.6"));
    expect(response.status).toBe(401);
  });

  it("returns 429 once the rate limit is exceeded", async () => {
    let lastResponse: Response | undefined;
    for (let i = 0; i < 25; i += 1) {
      lastResponse = await postLogin(request("/api/auth/login", { email: "a@example.com", password: "x" }));
    }
    expect(lastResponse?.status).toBe(429);
  });
});
```

Create `tests/api/auth-logout.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { resetMockAuthProviderForTests } from "@/lib/auth/mock-auth-provider";
import { resetRateLimiterForTests } from "@/lib/security/rate-limit";
import { POST as postLogout } from "@/app/api/auth/logout/route";

describe("POST /api/auth/logout", () => {
  beforeEach(() => {
    resetMockAuthProviderForTests();
    resetRateLimiterForTests();
  });

  it("clears the session cookie", async () => {
    const response = await postLogout(new Request("http://localhost/api/auth/logout", { method: "POST" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
```

- [ ] **Step 13: Run tests to verify they fail**

Run: `npm test -- tests/api/auth-signup.test.ts tests/api/auth-login.test.ts tests/api/auth-logout.test.ts`
Expected: FAIL — the route files don't exist yet.

- [ ] **Step 14: Add validation schemas to `lib/security/validation.ts`**

```typescript
export const authCredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
});
```
(`min(8)` is a reasonable floor for a real password; the mock provider doesn't enforce it beyond this shared schema, keeping the rule in one place.)

- [ ] **Step 15: Write `app/api/auth/signup/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { getAuthProviderForRequest } from "@/lib/auth/request-context";
import { consumeRateLimit, getRateLimiter } from "@/lib/security/rate-limit";
import { authCredentialsSchema } from "@/lib/security/validation";
import { withRequestLog } from "@/lib/observability/request-log";

function applyCookies(response: NextResponse, cookies: string[]): NextResponse {
  for (const cookie of cookies) response.headers.append("set-cookie", cookie);
  return response;
}

export const POST = withRequestLog("auth.signup", async (request: Request) => {
  const clientKey = request.headers.get("x-forwarded-for") ?? "unknown";
  const rateLimitResult = await consumeRateLimit(getRateLimiter(), `auth:${clientKey}`);
  if (!rateLimitResult.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded. Try again shortly." }, { status: 429 });
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = authCredentialsSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email and a password of at least 8 characters." }, { status: 400 });
  }

  const { provider, takeSetCookieHeaders } = getAuthProviderForRequest(request);
  const result = await provider.signUp(parsed.data.email, parsed.data.password);

  const response = result.error
    ? NextResponse.json({ error: result.error }, { status: 400 })
    : NextResponse.json({ ok: true });
  return applyCookies(response, takeSetCookieHeaders());
});
```

- [ ] **Step 16: Write `app/api/auth/login/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { getAuthProviderForRequest } from "@/lib/auth/request-context";
import { consumeRateLimit, getRateLimiter } from "@/lib/security/rate-limit";
import { authCredentialsSchema } from "@/lib/security/validation";
import { withRequestLog } from "@/lib/observability/request-log";

function applyCookies(response: NextResponse, cookies: string[]): NextResponse {
  for (const cookie of cookies) response.headers.append("set-cookie", cookie);
  return response;
}

export const POST = withRequestLog("auth.login", async (request: Request) => {
  const clientKey = request.headers.get("x-forwarded-for") ?? "unknown";
  const rateLimitResult = await consumeRateLimit(getRateLimiter(), `auth:${clientKey}`);
  if (!rateLimitResult.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded. Try again shortly." }, { status: 429 });
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = authCredentialsSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email and password." }, { status: 400 });
  }

  const { provider, takeSetCookieHeaders } = getAuthProviderForRequest(request);
  const result = await provider.signInWithPassword(parsed.data.email, parsed.data.password);

  const response = result.error
    ? NextResponse.json({ error: result.error }, { status: 401 })
    : NextResponse.json({ ok: true });
  return applyCookies(response, takeSetCookieHeaders());
});
```

- [ ] **Step 17: Write `app/api/auth/logout/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { getAuthProviderForRequest } from "@/lib/auth/request-context";
import { withRequestLog } from "@/lib/observability/request-log";

export const POST = withRequestLog("auth.logout", async (request: Request) => {
  const { provider, takeSetCookieHeaders } = getAuthProviderForRequest(request);
  await provider.signOut();
  const response = NextResponse.json({ ok: true });
  for (const cookie of takeSetCookieHeaders()) response.headers.append("set-cookie", cookie);
  return response;
});
```

- [ ] **Step 18: Run tests to verify they pass**

Run: `npm test -- tests/api/auth-signup.test.ts tests/api/auth-login.test.ts tests/api/auth-logout.test.ts`
Expected: PASS.

- [ ] **Step 19: Write the login/signup pages and their component tests**

Create `tests/components/LoginForm.test.tsx` (jsdom):
```typescript
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "@/components/LoginForm";

const pushMock = vi.fn();
const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  pushMock.mockClear();
  refreshMock.mockClear();
});

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe("LoginForm", () => {
  it("submits email and password, then redirects to /incidents on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<LoginForm />);
    await user.type(screen.getByLabelText("Email"), "a@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/incidents"));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/auth/login");
    expect(JSON.parse(String(init.body))).toEqual({ email: "a@example.com", password: "password123" });
  });

  it("shows the server's error message on failure and does not redirect", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "Invalid login credentials" }, 401)));
    const user = userEvent.setup();

    render(<LoginForm />);
    await user.type(screen.getByLabelText("Email"), "a@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByText("Invalid login credentials")).toBeTruthy();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
```

Create `tests/components/SignupForm.test.tsx` mirroring it (posts to `/api/auth/signup`, same assertions, error case uses a "duplicate email" message).

Run: `npm test -- tests/components/LoginForm.test.tsx tests/components/SignupForm.test.tsx` — confirm FAIL (components don't exist).

Create `components/LoginForm.tsx`:
```typescript
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "Login failed");
        return;
      }
      router.push(searchParams.get("next") ?? "/incidents");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="login-email" className="text-xs font-medium text-slate-300">Email</label>
        <input
          id="login-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="login-password" className="text-xs font-medium text-slate-300">Password</label>
        <input
          id="login-password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
        />
      </div>
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 transition-colors hover:bg-sky-400 disabled:opacity-50"
      >
        Log in
      </button>
    </form>
  );
}
```
Note: `useLabel` requires each `<input>`'s `id` to match the `<label htmlFor>` — already done above (`login-email`, `login-password`).

Create `components/SignupForm.tsx`, identical shape but posting to `/api/auth/signup` with ids `signup-email`/`signup-password` and button label `"Sign up"`.

Create `app/login/page.tsx`:
```typescript
import Link from "next/link";
import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-6 py-16">
      <h1 className="text-xl font-semibold text-slate-50">Log in</h1>
      <LoginForm />
      <p className="text-sm text-slate-400">
        No account? <Link href="/signup" className="text-sky-400 hover:underline">Sign up</Link>
      </p>
    </main>
  );
}
```

Create `app/signup/page.tsx`, same shape with `SignupForm`, linking back to `/login`.

Run: `npm test -- tests/components/LoginForm.test.tsx tests/components/SignupForm.test.tsx`
Expected: PASS.

- [ ] **Step 20: `SignOutButton` and `NavBar`**

Create `tests/components/NavBar.test.tsx`:
```typescript
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NavBar } from "@/components/NavBar";

vi.mock("@/lib/auth/server-component-context", () => ({
  getCurrentUser: vi.fn(),
}));
import { getCurrentUser } from "@/lib/auth/server-component-context";

afterEach(() => {
  cleanup();
  vi.mocked(getCurrentUser).mockReset();
});

describe("NavBar", () => {
  it("shows a Log in link when signed out", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    render(await NavBar());
    expect(screen.getByRole("link", { name: "Log in" })).toBeTruthy();
  });

  it("shows the user's email and a Sign out button when signed in", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "U1", email: "a@example.com" });
    render(await NavBar());
    expect(screen.getByText("a@example.com")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });
});
```

Run: `npm test -- tests/components/NavBar.test.tsx` — confirm FAIL.

Create `components/SignOutButton.tsx`:
```typescript
"use client";

import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();

  async function handleClick() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="rounded-md px-3 py-1.5 text-sm text-slate-300 transition-colors hover:bg-slate-800/70 hover:text-slate-50"
    >
      Sign out
    </button>
  );
}
```

Update `components/NavBar.tsx`:
```typescript
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/server-component-context";
import { SignOutButton } from "@/components/SignOutButton";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/incidents", label: "Incidents" },
  { href: "/evaluation", label: "Evaluation" },
  { href: "/about", label: "About" },
];

export async function NavBar() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
        <Link href="/" className="flex items-center gap-2 font-semibold text-slate-100">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-sky-400" aria-hidden />
          AI Incident Investigator
        </Link>
        <div className="flex items-center gap-1 text-sm">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-1.5 text-slate-300 transition-colors hover:bg-slate-800/70 hover:text-slate-50"
            >
              {link.label}
            </Link>
          ))}
          {user ? (
            <div className="ml-2 flex items-center gap-2 border-l border-slate-800 pl-3">
              <span className="text-xs text-slate-400">{user.email}</span>
              <SignOutButton />
            </div>
          ) : (
            <Link
              href="/login"
              className="ml-2 rounded-md border-l border-slate-800 px-3 py-1.5 pl-3 text-slate-300 transition-colors hover:bg-slate-800/70 hover:text-slate-50"
            >
              Log in
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
```
`app/layout.tsx` already renders `<NavBar />` as `{children}`'s sibling inside an async-capable Server Component tree — no change needed there since `RootLayout` itself isn't async, but rendering an async child component (`NavBar`) from a synchronous Server Component parent is directly supported by React Server Components (the parent doesn't need to await it itself).

Run: `npm test -- tests/components/NavBar.test.tsx`
Expected: PASS.

- [ ] **Step 21: Middleware**

Create `middleware.ts` (project root, next to `next.config.mjs`):
```typescript
import { NextResponse, type NextRequest } from "next/server";
import { getAuthProviderForRequest } from "@/lib/auth/request-context";

export async function middleware(request: NextRequest) {
  const { provider, takeSetCookieHeaders } = getAuthProviderForRequest(request);
  // Calling getUser() here (rather than just reading the cookie) is what
  // triggers @supabase/ssr's token refresh when the access token is
  // nearing expiry -- Server Components can't write cookies themselves,
  // so without this, sessions would silently start failing ~1 hour after
  // login even though the refresh token is still valid.
  const user = await provider.getUser();

  let response = NextResponse.next();
  for (const cookie of takeSetCookieHeaders()) response.headers.append("set-cookie", cookie);

  if (request.nextUrl.pathname.startsWith("/incidents/upload") && !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    response = NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 22: Fix the stale CSP comment in `next.config.mjs`**

The file's top comment currently reads: *"This app has no proxy/middleware, so there is no per-request nonce generation."* That's now false. Update it:
```javascript
// Content-Security-Policy. Nonce-based CSP would need per-request nonce
// generation wired through middleware.ts into the rendered HTML -- this
// project's middleware.ts exists only for auth session refresh and route
// gating (see middleware.ts), not response rewriting, so this still uses
// the static, no-nonce CSP Next.js documents as the supported alternative
// (node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md,
// "Without Nonces" section).
```
(Replace only that opening comment; the CSP header value itself and the rest of the file are unchanged — `connect-src 'self'` still holds since auth never calls Supabase from the browser, per Task 2's design.)

- [ ] **Step 23: Update `.env.example`**

Add a comment above the existing blank `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` lines clarifying they're now load-bearing:
```
# Used for authentication (Supabase Auth, email+password) via the
# NEXT_PUBLIC_SUPABASE_* vars below, and by the API routes under
# app/api/auth/*. Unset: auth falls back to an in-memory mock provider
# (works with zero external accounts, same as every other provider in
# this project -- see lib/auth/mock-auth-provider.ts).
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```
(Replace the existing comment above those two lines, which currently says "Only needed if the frontend talks to Supabase directly via RLS policies" — no longer accurate.)

- [ ] **Step 24: Full test suite + typecheck + lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS. (Task 3 is what fixes the remaining `listIncidents`/`getIncident` call-site arity errors from Task 1 if they weren't already patched with `null` placeholders — if `npm run typecheck` still fails only on those known call sites, that's expected and acceptable at the end of this task, since Task 3 is scoped to fix them.)

- [ ] **Step 25: Manual smoke test**

Run: `npm run dev`, visit `/signup`, create an account, confirm the nav bar shows the email and a working "Sign out" button, confirm `/login` works for the same account, confirm visiting `/incidents/upload` while logged out redirects to `/login?next=/incidents/upload`.

- [ ] **Step 26: Commit**

```bash
git add lib/auth app/api/auth app/login app/signup components/NavBar.tsx components/SignOutButton.tsx components/LoginForm.tsx components/SignupForm.tsx middleware.ts next.config.mjs .env.example package.json package-lock.json tests/auth tests/api/auth-*.test.ts tests/components/NavBar.test.tsx tests/components/LoginForm.test.tsx tests/components/SignupForm.test.tsx
git commit -m "feat: add email+password auth via Supabase Auth (mock provider when unconfigured)"
```

---

### Task 3: Wire real ownership through every repository consumer

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/api/incidents/route.ts`
- Modify: `app/api/incidents/[id]/route.ts`
- Modify: `app/api/incidents/[id]/investigate/route.ts`
- Modify: `app/api/incidents/[id]/similar/route.ts`
- Modify: `app/api/incidents/[id]/timeline/route.ts`
- Modify: `app/incidents/page.tsx`
- Modify: `app/incidents/[id]/page.tsx`
- Modify: `app/incidents/[id]/similar/page.tsx`
- Test: `tests/api/incidents.test.ts`, `tests/api/investigate.test.ts`, `tests/api/similar.test.ts`, `tests/api/timeline.test.ts` (update existing)

**Interfaces:**
- Consumes: `Repository.listIncidents(ownerId)`/`getIncident(id, ownerId)` from Task 1; `getCurrentUser()` from Task 2 (Server Components); `getAuthProviderForRequest(request).provider.getUser()` from Task 2 (Route Handlers).

- [ ] **Step 1: Update existing API route tests to cover ownership**

First, add `ownerId: null,` to every `Incident` object literal already in `tests/api/incidents.test.ts`, `tests/api/investigate.test.ts`, `tests/api/similar.test.ts`, and `tests/api/timeline.test.ts` (each file has exactly one — a `beforeEach`-seeded fixture or a module-level `const incident`). This is required, not optional cleanup: once this task wires a real `ownerId` through `listIncidents`/`getIncident`, an existing fixture missing that field has `ownerId: undefined`, and the ownership filter's `incident.ownerId !== null` check treats `undefined` as "belongs to someone else" — every existing happy-path test in these four files (e.g. "GET /api/incidents returns the seeded incident") would start failing with an empty list or 404 the moment this task's route changes land, not because the route is wrong but because the fixture silently stopped matching. Fix the fixtures before touching the routes.

Then, in `tests/api/incidents.test.ts`, add (alongside existing tests) a case proving a private incident owned by one user is invisible to another caller. Since these routes read the session via cookies and the test harness has no real Supabase project configured, the mock auth provider is active — sign up a user through the real signup route first to get a session cookie, then reuse it:

```typescript
import { POST as postSignup } from "@/app/api/auth/signup/route";

it("excludes another user's private incidents from the list", async () => {
  const signupResponse = await postSignup(
    new Request("http://localhost/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: "owner@example.com", password: "password123" }),
    }),
  );
  const cookie = signupResponse.headers.get("set-cookie")!.split(";")[0];

  await getRepository().upsertIncident({
    id: "INC-PRIVATE",
    title: "Private incident",
    severity: "sev3",
    status: "open",
    startedAt: "2026-01-01T00:00:00.000Z",
    resolvedAt: null,
    rootCauseTruth: null,
    affectedServices: [],
    ownerId: "some-other-user",
  });

  const response = await listIncidents(new Request("http://localhost/api/incidents", { headers: { cookie } }));
  const body = await response.json();
  expect(body.incidents.some((i: { id: string }) => i.id === "INC-PRIVATE")).toBe(false);
});
```
(`tests/api/incidents.test.ts` already imports the route's `GET` export as `listIncidents` — `import { GET as listIncidents } from "@/app/api/incidents/route";` — reuse that existing import, don't add a second one.)

Add equivalent single-incident-visibility tests to `tests/api/investigate.test.ts` and `tests/api/similar.test.ts`: a private incident owned by `"some-other-user"` returns 404 from `getIncident`-backed routes when fetched without that owner's session cookie.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/api/incidents.test.ts tests/api/investigate.test.ts tests/api/similar.test.ts`
Expected: FAIL — routes still call `listIncidents()`/`getIncident(id)` with no ownership awareness (either a TS arity error if Task 1 didn't leave `null` placeholders, or the new assertions failing because ownership isn't enforced yet).

- [ ] **Step 3: `app/api/incidents/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/index";
import { getAuthProviderForRequest } from "@/lib/auth/request-context";
import { withRequestLog } from "@/lib/observability/request-log";

export const GET = withRequestLog("incidents.list", async (request: Request) => {
  const { provider } = getAuthProviderForRequest(request);
  const user = await provider.getUser();
  const repository = getRepository();
  const incidents = await repository.listIncidents(user?.id ?? null);
  return NextResponse.json({ incidents });
});
```

- [ ] **Step 4: `app/api/incidents/[id]/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/index";
import { getAuthProviderForRequest } from "@/lib/auth/request-context";
import { incidentIdSchema } from "@/lib/security/validation";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const parsed = incidentIdSchema.safeParse(id);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid incident id" }, { status: 400 });
  }

  const { provider } = getAuthProviderForRequest(request);
  const user = await provider.getUser();
  const repository = getRepository();
  const incident = await repository.getIncident(parsed.data, user?.id ?? null);
  if (!incident) {
    return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  }
  return NextResponse.json({ incident });
}
```

- [ ] **Step 5: `app/api/incidents/[id]/investigate/route.ts`**

Change the handler to resolve the user first, use it for both `getIncident` and `listIncidents`, and only pass `validRootCauses` for a shared (seeded) incident:
```typescript
export const POST = withRequestLog("incidents.investigate", async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const parsedId = incidentIdSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Invalid incident id" }, { status: 400 });
  }

  const clientKey = request.headers.get("x-forwarded-for") ?? "unknown";
  const rateLimitResult = await consumeRateLimit(getRateLimiter(), `investigate:${clientKey}`);
  if (!rateLimitResult.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded. Try again shortly." }, { status: 429 });
  }

  const { provider } = getAuthProviderForRequest(request);
  const user = await provider.getUser();
  const ownerId = user?.id ?? null;

  const repository = getRepository();
  const incident = await repository.getIncident(parsedId.data, ownerId);
  if (!incident) {
    return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  }

  const [logEvents, metricEvents, documents, allIncidents] = await Promise.all([
    repository.listLogEvents(incident.id),
    repository.listMetricEvents(incident.id),
    repository.listDocuments(),
    repository.listIncidents(ownerId),
  ]);

  const historicalIncidents = allIncidents
    .filter((other) => other.id !== incident.id)
    .map((other) => ({ incident: other, summary: buildHistoricalSummary(other) }));

  const llmProvider = getLLMProvider();

  try {
    const result = await runInvestigation({
      incident,
      logEvents,
      metricEvents,
      documents,
      historicalIncidents,
      llmProvider,
      embeddingProvider: getEmbeddingProvider(),
      // Only seeded (shared, owner_id: null) incidents are scoped to this
      // synthetic fault taxonomy -- a real uploaded incident's root cause
      // has nothing to do with it, so constraining the model's output
      // here would force a meaningless answer. See
      // docs/superpowers/specs/2026-08-23-multi-user-auth-design.md.
      validRootCauses: incident.ownerId === null ? [...FAULT_SLUGS] : undefined,
    });
    // ...rest of the try block unchanged...
```
(The rest of the function — `saveAnalysisRun`/`savePredictions`/error handling — is untouched.)

- [ ] **Step 6: `app/api/incidents/[id]/similar/route.ts`**

```typescript
export const GET = withRequestLog("incidents.similar", async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const parsedId = incidentIdSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Invalid incident id" }, { status: 400 });
  }

  const clientKey = request.headers.get("x-forwarded-for") ?? "unknown";
  const rateLimitResult = await consumeRateLimit(getRateLimiter(), `similar:${clientKey}`);
  if (!rateLimitResult.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded. Try again shortly." }, { status: 429 });
  }

  const { provider } = getAuthProviderForRequest(request);
  const user = await provider.getUser();
  const ownerId = user?.id ?? null;

  const repository = getRepository();
  const incident = await repository.getIncident(parsedId.data, ownerId);
  if (!incident) {
    return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  }

  const allIncidents = await repository.listIncidents(ownerId);
  const candidates = allIncidents.map((other) => ({ incident: other, summary: buildHistoricalSummary(other) }));
  // ...rest unchanged...
```

- [ ] **Step 7: `app/api/incidents/[id]/timeline/route.ts`**

```typescript
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const parsedId = incidentIdSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Invalid incident id" }, { status: 400 });
  }

  const { provider } = getAuthProviderForRequest(request);
  const user = await provider.getUser();
  const repository = getRepository();
  const incident = await repository.getIncident(parsedId.data, user?.id ?? null);
  if (!incident) {
    return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  }
  // ...rest unchanged...
```
(Add the `getAuthProviderForRequest` import.)

- [ ] **Step 8: `app/page.tsx` and `app/incidents/page.tsx`**

`app/page.tsx`: add `import { getCurrentUser } from "@/lib/auth/server-component-context";` and change `const incidents = await repository.listIncidents();` to:
```typescript
const user = await getCurrentUser();
const incidents = await repository.listIncidents(user?.id ?? null);
```

`app/incidents/page.tsx`: this task only fixes the call's arity (passing the real `ownerId`); the "Shared catalog" / "Your incidents" visual split is Task 6's job. For now:
```typescript
import { getRepository } from "@/lib/db/index";
import { getCurrentUser } from "@/lib/auth/server-component-context";
import { IncidentFilter } from "@/components/IncidentFilter";

export const dynamic = "force-dynamic";

export default async function IncidentsPage() {
  const user = await getCurrentUser();
  const repository = getRepository();
  const incidents = await repository.listIncidents(user?.id ?? null);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold text-slate-50">Incidents</h1>
        <p className="mt-1 text-sm text-slate-400">
          All incidents in the simulated dataset. Search by title or filter by severity.
        </p>
      </div>

      <IncidentFilter incidents={incidents} />
    </main>
  );
}
```

- [ ] **Step 9: `app/incidents/[id]/page.tsx`**

Add the import and swap the `getIncident` call:
```typescript
import { getCurrentUser } from "@/lib/auth/server-component-context";
// ...
const user = await getCurrentUser();
const incident = await repository.getIncident(id, user?.id ?? null);
```
Also fix the ground-truth section (currently renders `{incident.rootCauseTruth}` unconditionally at line 92):
```tsx
<p className="text-sm text-slate-300">
  {incident.rootCauseTruth ?? "Not available — real incident, no known ground truth"}
</p>
```

- [ ] **Step 10: `app/incidents/[id]/similar/page.tsx`**

```typescript
import { getCurrentUser } from "@/lib/auth/server-component-context";
// ...
const user = await getCurrentUser();
const incident = await repository.getIncident(id, user?.id ?? null);
// ...
const allIncidents = await repository.listIncidents(user?.id ?? null);
```
Fix the same null-display issue at line 64:
```tsx
<p className="mt-1 text-xs text-slate-500">{match.rootCauseTruth ?? "No known ground truth"}</p>
```

- [ ] **Step 11: Run the full test suite, typecheck, lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS — this is the point where every remaining `ownerId`-arity error from Task 1 is now actually fixed, not just deferred.

- [ ] **Step 12: Manual smoke test**

Run: `npm run dev`. As a logged-out visitor, confirm `/incidents` still shows all 56 seeded incidents and a detail page still investigates normally. Sign up as a test user (via `/signup`), manually insert a private incident for that user (or wait for Task 4's upload flow), confirm it doesn't leak to a second account or to a logged-out session.

- [ ] **Step 13: Commit**

```bash
git add app/page.tsx app/api/incidents app/incidents tests/api
git commit -m "feat: scope incident visibility to the authenticated user everywhere"
```

---

### Task 4: Upload API route

**Files:**
- Modify: `lib/security/validation.ts`
- Create: `app/api/incidents/upload/route.ts`
- Test: `tests/security/validation.test.ts` (update existing, if present — otherwise create)
- Test: `tests/api/incidents-upload.test.ts`

**Interfaces:**
- Consumes: `Repository.upsertIncident`, `Repository.insertLogEvents`, `Repository.insertMetricEvents` (existing, unchanged signatures); `getAuthProviderForRequest` (Task 2).
- Produces: `POST /api/incidents/upload` → `{ incident: Incident }` on success (201).

- [ ] **Step 1: Write the failing validation schema tests**

Add to (or create) `tests/security/validation.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { uploadedLogLineSchema, uploadedMetricLineSchema, uploadTitleSchema, uploadSeveritySchema } from "@/lib/security/validation";

describe("uploadedLogLineSchema", () => {
  it("accepts a well-formed line", () => {
    const result = uploadedLogLineSchema.safeParse({
      timestamp: "2026-01-01T00:00:00.000Z",
      service: "payment-service",
      level: "error",
      message: "connection refused",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid level", () => {
    const result = uploadedLogLineSchema.safeParse({
      timestamp: "2026-01-01T00:00:00.000Z",
      service: "payment-service",
      level: "critical",
      message: "x",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-ISO timestamp", () => {
    const result = uploadedLogLineSchema.safeParse({
      timestamp: "not a date",
      service: "payment-service",
      level: "error",
      message: "x",
    });
    expect(result.success).toBe(false);
  });
});

describe("uploadedMetricLineSchema", () => {
  it("accepts a well-formed line", () => {
    const result = uploadedMetricLineSchema.safeParse({
      timestamp: "2026-01-01T00:00:00.000Z",
      service: "payment-service",
      metric: "cpu_percent",
      value: 87.5,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-numeric value", () => {
    const result = uploadedMetricLineSchema.safeParse({
      timestamp: "2026-01-01T00:00:00.000Z",
      service: "payment-service",
      metric: "cpu_percent",
      value: "high",
    });
    expect(result.success).toBe(false);
  });
});

describe("uploadSeveritySchema", () => {
  it("defaults to sev3 when omitted", () => {
    expect(uploadSeveritySchema.parse(undefined)).toBe("sev3");
  });
  it("rejects an unknown severity", () => {
    expect(uploadSeveritySchema.safeParse("sev9").success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/security/validation.test.ts`
Expected: FAIL — the new schemas don't exist.

- [ ] **Step 3: Add the schemas to `lib/security/validation.ts`**

```typescript
import { LOG_LEVELS, SEVERITIES } from "@/lib/types";

export const uploadedLogLineSchema = z.object({
  timestamp: z.string().datetime(),
  service: z.string().min(1).max(128),
  level: z.enum(LOG_LEVELS),
  message: z.string().min(1).max(2000),
});

export const uploadedMetricLineSchema = z.object({
  timestamp: z.string().datetime(),
  service: z.string().min(1).max(128),
  metric: z.string().min(1).max(128),
  value: z.number(),
});

export const uploadTitleSchema = z.string().min(1).max(200);
export const uploadSeveritySchema = z.enum(SEVERITIES).default("sev3");
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/security/validation.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing upload route test**

Create `tests/api/incidents-upload.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { resetRepositoryForTests, getRepository } from "@/lib/db/index";
import { resetMockAuthProviderForTests } from "@/lib/auth/mock-auth-provider";
import { resetRateLimiterForTests } from "@/lib/security/rate-limit";
import { POST as postSignup } from "@/app/api/auth/signup/route";
import { POST as postUpload } from "@/app/api/incidents/upload/route";

async function signedInCookie(): Promise<string> {
  const response = await postSignup(
    new Request("http://localhost/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: "uploader@example.com", password: "password123" }),
    }),
  );
  return response.headers.get("set-cookie")!.split(";")[0];
}

function uploadRequest(form: FormData, cookie?: string): Request {
  return new Request("http://localhost/api/incidents/upload", {
    method: "POST",
    headers: cookie ? { cookie } : {},
    body: form,
  });
}

function logLinesFile(lines: object[]): File {
  return new File([lines.map((l) => JSON.stringify(l)).join("\n")], "app.log", { type: "application/x-ndjson" });
}

describe("POST /api/incidents/upload", () => {
  beforeEach(() => {
    resetRepositoryForTests();
    resetMockAuthProviderForTests();
    resetRateLimiterForTests();
  });

  it("rejects an unauthenticated request", async () => {
    const form = new FormData();
    form.set("title", "My incident");
    form.set("logFile", logLinesFile([{ timestamp: "2026-01-01T00:00:00.000Z", service: "api", level: "error", message: "x" }]));
    const response = await postUpload(uploadRequest(form));
    expect(response.status).toBe(401);
  });

  it("creates a private incident owned by the caller, with log events inserted", async () => {
    const cookie = await signedInCookie();
    const form = new FormData();
    form.set("title", "My incident");
    form.set("severity", "sev2");
    form.set(
      "logFile",
      logLinesFile([
        { timestamp: "2026-01-01T00:05:00.000Z", service: "api", level: "error", message: "timeout" },
        { timestamp: "2026-01-01T00:00:00.000Z", service: "worker", level: "warn", message: "retrying" },
      ]),
    );

    const response = await postUpload(uploadRequest(form, cookie));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.incident.title).toBe("My incident");
    expect(body.incident.severity).toBe("sev2");
    expect(body.incident.rootCauseTruth).toBeNull();
    expect(body.incident.ownerId).toBeTruthy();
    // earliest of the two log timestamps
    expect(body.incident.startedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(body.incident.affectedServices.sort()).toEqual(["api", "worker"]);

    const logEvents = await getRepository().listLogEvents(body.incident.id);
    expect(logEvents).toHaveLength(2);
  });

  it("also inserts metric events when a metrics file is provided", async () => {
    const cookie = await signedInCookie();
    const form = new FormData();
    form.set("title", "My incident");
    form.set("logFile", logLinesFile([{ timestamp: "2026-01-01T00:00:00.000Z", service: "api", level: "error", message: "x" }]));
    form.set(
      "metricsFile",
      new File(
        [JSON.stringify({ timestamp: "2026-01-01T00:00:00.000Z", service: "api", metric: "cpu_percent", value: 91 })],
        "metrics.log",
      ),
    );

    const response = await postUpload(uploadRequest(form, cookie));
    expect(response.status).toBe(201);
    const body = await response.json();
    const metricEvents = await getRepository().listMetricEvents(body.incident.id);
    expect(metricEvents).toHaveLength(1);
    expect(metricEvents[0]?.metric).toBe("cpu_percent");
  });

  it("rejects a malformed log line with the line number", async () => {
    const cookie = await signedInCookie();
    const form = new FormData();
    form.set("title", "My incident");
    form.set(
      "logFile",
      new File(
        [
          [
            JSON.stringify({ timestamp: "2026-01-01T00:00:00.000Z", service: "api", level: "error", message: "ok" }),
            JSON.stringify({ timestamp: "not a date", service: "api", level: "error", message: "bad" }),
          ].join("\n"),
        ],
        "app.log",
      ),
    );

    const response = await postUpload(uploadRequest(form, cookie));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("line 2");

    // Nothing should have been written for a rejected upload.
    expect((await getRepository().listIncidents(null)).length).toBe(0);
  });

  it("rejects a log file over the 2MB cap without parsing it", async () => {
    const cookie = await signedInCookie();
    const form = new FormData();
    form.set("title", "My incident");
    form.set("logFile", new File([new Uint8Array(2 * 1024 * 1024 + 1)], "app.log"));
    const response = await postUpload(uploadRequest(form, cookie));
    expect(response.status).toBe(413);
  });

  it("rejects a request with no log file", async () => {
    const cookie = await signedInCookie();
    const form = new FormData();
    form.set("title", "My incident");
    const response = await postUpload(uploadRequest(form, cookie));
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npm test -- tests/api/incidents-upload.test.ts`
Expected: FAIL — the route doesn't exist yet.

- [ ] **Step 7: Write `app/api/incidents/upload/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/index";
import { getAuthProviderForRequest } from "@/lib/auth/request-context";
import { consumeRateLimit, getRateLimiter } from "@/lib/security/rate-limit";
import {
  uploadTitleSchema,
  uploadSeveritySchema,
  uploadedLogLineSchema,
  uploadedMetricLineSchema,
} from "@/lib/security/validation";
import { withRequestLog } from "@/lib/observability/request-log";
import type { LogEvent, MetricEvent } from "@/lib/types";

const MAX_FILE_BYTES = 2 * 1024 * 1024;

function parseLines<T>(text: string, schema: { safeParse(v: unknown): { success: boolean; data?: T; error?: { issues: Array<{ message: string }> } } }): { lines: T[] } | { error: string } {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const parsed: T[] = [];
  for (const [index, line] of lines.entries()) {
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      return { error: `Invalid JSON on line ${index + 1}` };
    }
    const result = schema.safeParse(json);
    if (!result.success || !result.data) {
      const message = result.error?.issues.map((i) => i.message).join("; ") ?? "invalid";
      return { error: `Invalid entry on line ${index + 1}: ${message}` };
    }
    parsed.push(result.data);
  }
  return { lines: parsed };
}

export const POST = withRequestLog("incidents.upload", async (request: Request) => {
  const { provider } = getAuthProviderForRequest(request);
  const user = await provider.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const rateLimitResult = await consumeRateLimit(getRateLimiter(), `upload:${user.id}`);
  if (!rateLimitResult.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded. Try again shortly." }, { status: 429 });
  }

  const form = await request.formData();
  const titleResult = uploadTitleSchema.safeParse(form.get("title"));
  if (!titleResult.success) {
    return NextResponse.json({ error: "A title is required." }, { status: 400 });
  }
  const severityResult = uploadSeveritySchema.safeParse(form.get("severity") ?? undefined);
  if (!severityResult.success) {
    return NextResponse.json({ error: "Invalid severity." }, { status: 400 });
  }

  const logFile = form.get("logFile");
  if (!(logFile instanceof File)) {
    return NextResponse.json({ error: "A log file is required." }, { status: 400 });
  }
  if (logFile.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "Log file exceeds the 2MB limit." }, { status: 413 });
  }
  const metricsFile = form.get("metricsFile");
  if (metricsFile instanceof File && metricsFile.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "Metrics file exceeds the 2MB limit." }, { status: 413 });
  }

  const logResult = parseLines(await logFile.text(), uploadedLogLineSchema);
  if ("error" in logResult) {
    return NextResponse.json({ error: logResult.error }, { status: 400 });
  }
  if (logResult.lines.length === 0) {
    return NextResponse.json({ error: "Log file has no entries." }, { status: 400 });
  }

  let metricLines: Array<{ timestamp: string; service: string; metric: string; value: number }> = [];
  if (metricsFile instanceof File) {
    const metricResult = parseLines(await metricsFile.text(), uploadedMetricLineSchema);
    if ("error" in metricResult) {
      return NextResponse.json({ error: metricResult.error }, { status: 400 });
    }
    metricLines = metricResult.lines;
  }

  const incidentId = globalThis.crypto.randomUUID();
  const startedAt = logResult.lines.reduce((min, l) => (l.timestamp < min ? l.timestamp : min), logResult.lines[0]!.timestamp);
  const affectedServices = [...new Set(logResult.lines.map((l) => l.service))];

  const incident = {
    id: incidentId,
    title: titleResult.data,
    severity: severityResult.data,
    status: "open" as const,
    startedAt,
    resolvedAt: null,
    rootCauseTruth: null,
    affectedServices,
    ownerId: user.id,
  };

  const logEvents: LogEvent[] = logResult.lines.map((line) => ({
    id: globalThis.crypto.randomUUID(),
    incidentId,
    timestamp: line.timestamp,
    service: line.service,
    level: line.level,
    template: line.message,
    count: 1,
  }));
  const metricEvents: MetricEvent[] = metricLines.map((line) => ({
    id: globalThis.crypto.randomUUID(),
    incidentId,
    timestamp: line.timestamp,
    service: line.service,
    metric: line.metric,
    value: line.value,
  }));

  const repository = getRepository();
  await repository.upsertIncident(incident);
  await repository.insertLogEvents(logEvents);
  if (metricEvents.length > 0) {
    await repository.insertMetricEvents(metricEvents);
  }

  return NextResponse.json({ incident }, { status: 201 });
});
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test -- tests/api/incidents-upload.test.ts`
Expected: PASS.

- [ ] **Step 9: Full suite + typecheck + lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add lib/security/validation.ts app/api/incidents/upload tests/security/validation.test.ts tests/api/incidents-upload.test.ts
git commit -m "feat: add authenticated JSON-Lines log/metrics upload endpoint"
```

---

### Task 5: Upload UI page

**Files:**
- Create: `components/UploadIncidentForm.tsx`
- Create: `app/incidents/upload/page.tsx`
- Test: `tests/components/UploadIncidentForm.test.tsx`

**Interfaces:**
- Consumes: `POST /api/incidents/upload` (Task 4).

- [ ] **Step 1: Write the failing component test**

Create `tests/components/UploadIncidentForm.test.tsx`:
```typescript
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UploadIncidentForm } from "@/components/UploadIncidentForm";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  pushMock.mockClear();
});

function jsonResponse(body: unknown, status = 201): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe("UploadIncidentForm", () => {
  it("submits title and log file as multipart form data, then navigates to the new incident", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ incident: { id: "INC-NEW" } }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<UploadIncidentForm />);
    await user.type(screen.getByLabelText("Title"), "Checkout errors spiking");
    const file = new File(['{"timestamp":"2026-01-01T00:00:00.000Z","service":"api","level":"error","message":"x"}'], "app.log", {
      type: "text/plain",
    });
    await user.upload(screen.getByLabelText("Log file"), file);
    await user.click(screen.getByRole("button", { name: "Upload and investigate" }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/incidents/INC-NEW"));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/incidents/upload");
    expect(init.body).toBeInstanceOf(FormData);
  });

  it("shows the server's line-numbered error on a malformed upload", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "Invalid entry on line 2: Invalid datetime" }, 400)));
    const user = userEvent.setup();

    render(<UploadIncidentForm />);
    await user.type(screen.getByLabelText("Title"), "Bad file");
    const file = new File(["bad"], "app.log", { type: "text/plain" });
    await user.upload(screen.getByLabelText("Log file"), file);
    await user.click(screen.getByRole("button", { name: "Upload and investigate" }));

    expect(await screen.findByText("Invalid entry on line 2: Invalid datetime")).toBeTruthy();
  });

  it("rejects submission without a log file, without ever calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<UploadIncidentForm />);
    await user.type(screen.getByLabelText("Title"), "No file");
    await user.click(screen.getByRole("button", { name: "Upload and investigate" }));

    expect(await screen.findByText("Choose a log file to upload.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/components/UploadIncidentForm.test.tsx`
Expected: FAIL — the component doesn't exist.

- [ ] **Step 3: Write `components/UploadIncidentForm.tsx`**

```typescript
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SEVERITIES } from "@/lib/types";

export function UploadIncidentForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState<(typeof SEVERITIES)[number]>("sev3");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const logFileRef = useRef<HTMLInputElement>(null);
  const metricsFileRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const logFile = logFileRef.current?.files?.[0];
    if (!logFile) {
      setError("Choose a log file to upload.");
      return;
    }

    const form = new FormData();
    form.set("title", title);
    form.set("severity", severity);
    form.set("logFile", logFile);
    const metricsFile = metricsFileRef.current?.files?.[0];
    if (metricsFile) form.set("metricsFile", metricsFile);

    setSubmitting(true);
    try {
      const response = await fetch("/api/incidents/upload", { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "Upload failed");
        return;
      }
      router.push(`/incidents/${body.incident.id}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="upload-title" className="text-xs font-medium text-slate-300">Title</label>
        <input
          id="upload-title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="upload-severity" className="text-xs font-medium text-slate-300">Severity</label>
        <select
          id="upload-severity"
          value={severity}
          onChange={(e) => setSeverity(e.target.value as (typeof SEVERITIES)[number])}
          className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
        >
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="upload-log-file" className="text-xs font-medium text-slate-300">Log file</label>
        <input id="upload-log-file" ref={logFileRef} type="file" accept=".log,.jsonl,.txt" aria-label="Log file" className="text-sm text-slate-300" />
        <p className="text-xs text-slate-500">JSON Lines: one {"{timestamp, service, level, message}"} object per line.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="upload-metrics-file" className="text-xs font-medium text-slate-300">Metrics file (optional)</label>
        <input id="upload-metrics-file" ref={metricsFileRef} type="file" accept=".log,.jsonl,.txt" aria-label="Metrics file" className="text-sm text-slate-300" />
        <p className="text-xs text-slate-500">JSON Lines: one {"{timestamp, service, metric, value}"} object per line.</p>
      </div>
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 transition-colors hover:bg-sky-400 disabled:opacity-50"
      >
        Upload and investigate
      </button>
    </form>
  );
}
```
Note: the test uses `screen.getByLabelText("Log file")` / `"Title"` — the `<input id="upload-title">`/`<label htmlFor="upload-title">` pair satisfies "Title"; the file inputs use an explicit `aria-label` (in addition to their visible `<label>`, whose text differs slightly ("Log file" matches exactly, so either would resolve it) — keep both for accessibility.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/components/UploadIncidentForm.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write `app/incidents/upload/page.tsx`**

```typescript
import { UploadIncidentForm } from "@/components/UploadIncidentForm";

export default function UploadIncidentPage() {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold text-slate-50">Upload an incident</h1>
        <p className="mt-1 text-sm text-slate-400">
          Bring your own error log. It's investigated the same way as the demo dataset, and only
          you can see it.
        </p>
      </div>
      <UploadIncidentForm />
    </main>
  );
}
```
(No auth check needed in the page itself — `middleware.ts` from Task 2 already redirects unauthenticated requests to `/incidents/upload` to `/login?next=/incidents/upload` before this page ever renders.)

- [ ] **Step 6: Manual smoke test**

Run: `npm run dev`, log in, visit `/incidents/upload`, submit a small JSON-Lines log file, confirm redirect to the new incident's detail page and that `InvestigatePanel` works on it.

- [ ] **Step 7: Commit**

```bash
git add components/UploadIncidentForm.tsx app/incidents/upload tests/components/UploadIncidentForm.test.tsx
git commit -m "feat: add the incident upload page"
```

---

### Task 6: Incidents list — shared vs. your incidents

**Files:**
- Modify: `app/incidents/page.tsx`
- Modify: `components/NavBar.tsx` (add an "Upload" link)

**Interfaces:**
- Consumes: `getCurrentUser()` (Task 2), `Repository.listIncidents(ownerId)` (Task 1, already wired by Task 3).

- [ ] **Step 1: Update `app/incidents/page.tsx`**

```typescript
import Link from "next/link";
import { getRepository } from "@/lib/db/index";
import { getCurrentUser } from "@/lib/auth/server-component-context";
import { IncidentFilter } from "@/components/IncidentFilter";

export const dynamic = "force-dynamic";

export default async function IncidentsPage() {
  const user = await getCurrentUser();
  const repository = getRepository();
  const incidents = await repository.listIncidents(user?.id ?? null);
  const sharedIncidents = incidents.filter((i) => i.ownerId === null);
  const yourIncidents = incidents.filter((i) => i.ownerId !== null);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-50">Incidents</h1>
          <p className="mt-1 text-sm text-slate-400">
            Search by title or filter by severity.
          </p>
        </div>
        {user ? (
          <Link
            href="/incidents/upload"
            className="shrink-0 rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 transition-colors hover:bg-sky-400"
          >
            Upload an incident
          </Link>
        ) : null}
      </div>

      {user ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-200">Your incidents</h2>
          {yourIncidents.length > 0 ? (
            <IncidentFilter incidents={yourIncidents} />
          ) : (
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-6 text-center text-sm text-slate-400">
              Nothing uploaded yet.{" "}
              <Link href="/incidents/upload" className="text-sky-400 hover:underline">Upload a log file</Link> to get started.
            </div>
          )}
        </section>
      ) : (
        <div className="rounded-lg border border-slate-800 bg-slate-900/20 p-4 text-sm text-slate-400">
          <Link href="/login" className="text-sky-400 hover:underline">Log in</Link> to upload your own incidents.
        </div>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-200">Shared catalog</h2>
        <IncidentFilter incidents={sharedIncidents} />
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Add an "Upload" nav link for signed-in users in `components/NavBar.tsx`**

Add `{ href: "/incidents/upload", label: "Upload" }` conditionally — since `LINKS` is currently a flat module-level constant rendered for everyone, change the render to filter it when signed out:
```typescript
const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/incidents", label: "Incidents" },
  { href: "/incidents/upload", label: "Upload", requiresAuth: true },
  { href: "/evaluation", label: "Evaluation" },
  { href: "/about", label: "About" },
];
```
In the render, change `{LINKS.map((link) => (` to filter first:
```typescript
{LINKS.filter((link) => !link.requiresAuth || user).map((link) => (
```

- [ ] **Step 3: Update `tests/components/NavBar.test.tsx`**

Add:
```typescript
it("hides the Upload link when signed out and shows it when signed in", async () => {
  vi.mocked(getCurrentUser).mockResolvedValue(null);
  const { rerender } = render(await NavBar());
  expect(screen.queryByRole("link", { name: "Upload" })).toBeNull();

  vi.mocked(getCurrentUser).mockResolvedValue({ id: "U1", email: "a@example.com" });
  rerender(await NavBar());
  expect(screen.getByRole("link", { name: "Upload" })).toBeTruthy();
});
```

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/components/NavBar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Manual smoke test**

Run: `npm run dev`. Logged out: `/incidents` shows only "Shared catalog" plus a login prompt, no "Upload" nav link. Logged in with no uploads: "Your incidents" shows the empty-state prompt. After uploading one (Task 5): it appears under "Your incidents" only, and a second test account does not see it.

- [ ] **Step 6: Commit**

```bash
git add app/incidents/page.tsx components/NavBar.tsx tests/components/NavBar.test.tsx
git commit -m "feat: split the incidents list into shared catalog and your incidents"
```

---

### Task 7: Docs

**Files:**
- Modify: `README.md`
- Modify: `docs/AI_Production_Incident_Investigator_Free_Stack_Plan.md` (only if it enumerates env vars or features in a way this makes stale — check before editing)

**Interfaces:** none (docs only).

- [ ] **Step 1: Update `README.md`**

Add a short "Authentication and uploading your own incidents" section (placed near the existing feature/setup description — read the current README structure first to match its heading style) covering: Supabase Auth email+password, the shared-vs-private incident model, how to upload a log file (JSON Lines format, the two required fields), and that everything works with zero external accounts via the mock providers (auth included now). Update the "Environment variables" table/list to mark `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` as used, not just optional-and-unused. Update the test count if the README states an exact number (check current count via `npm test -- --run 2>&1 | tail -5` after Task 6 and use the real number, not an estimate).

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document auth and the incident-upload feature"
```
