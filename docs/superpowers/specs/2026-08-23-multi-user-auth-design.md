# Multi-User Auth + Private Uploaded Incidents — Design

**Status:** Approved by user in chat, pending spec review.
**Depends on:** `docs/superpowers/specs/2026-08-20-incident-investigator-build-design.md` (the base app this extends).

## Problem

The app currently has no user concept. `listIncidents()` returns one global,
shared catalog (the 56 seeded synthetic incidents); there is no login, no
ownership, and no way for someone to bring their own error log and
investigate it privately. The user wants:

1. Authentication, so different people can have distinct identities.
2. A way to upload/connect their own error log file, which becomes an
   incident only they can see and investigate.
3. The existing shared seeded catalog to remain visible to everyone
   (logged in or not) as a demo/reference dataset.

## Non-goals

- No org/team sharing (an uploaded incident is visible only to its
  uploader — no "share with teammate" feature).
- No OAuth providers (email+password only, per user decision).
- No RLS-policy-based authorization (see Decision: Authorization below).
- No streaming/webhook log ingestion — file upload only.
- No editing/deleting an uploaded incident after creation (matches the
  existing app: incidents are otherwise immutable once seeded).

## Decision: Authorization model

Keep the project's existing pattern — the service-role key is used
server-side for all Supabase access, and **zero RLS policies** are used
as an intentional lockdown (documented in `supabase/migrations/0001_init.sql`
and `0002_feedback.sql`). Authorization (who can see which incident) is
enforced in application code (`Repository` method signatures take an
`ownerId` and filter), not in the database via `auth.uid()`-keyed
policies. This is one less place to get subtly wrong, and it matches how
every other table in this project is already handled — introducing a
second authorization mechanism (RLS) alongside the app-code one would be
redundant and a source of drift.

Supabase Auth is still used for **authentication** (issuing/verifying
sessions) — that part doesn't overlap with the RLS decision. Only
*authorization* (row visibility) stays in app code.

## Data model changes

`supabase/migrations/0003_auth.sql` (new):

```sql
alter table incidents add column owner_id uuid references auth.users(id);
alter table incidents alter column root_cause_truth drop not null;
create index if not exists incidents_owner_idx on incidents(owner_id);
```

- `owner_id IS NULL` → shared seeded incident, visible to everyone.
- `owner_id = <uuid>` → private, visible only to that user.
- `root_cause_truth` becomes nullable: uploaded real-world incidents have
  no known ground truth (the column exists for eval purposes against the
  synthetic dataset only).

`lib/types.ts`:
```typescript
export interface Incident {
  // ...unchanged fields...
  rootCauseTruth: string | null;
  ownerId: string | null; // new
}
```

`memory-repository.ts` and `supabase-repository.ts` both get the
corresponding column/field plumbing. The in-memory repository (used in
tests and as the no-Supabase-configured fallback) treats `ownerId` the
same way — filtered in JS instead of SQL.

## Repository interface changes

`lib/db/repository.ts`:
```typescript
listIncidents(ownerId: string | null): Promise<Incident[]>;
// Returns incidents where owner_id IS NULL OR owner_id = ownerId.
// ownerId === null (logged-out caller) returns only the shared catalog.

getIncident(id: string, ownerId: string | null): Promise<Incident | null>;
// Returns null (not just "not found" — indistinguishable from a
// nonexistent id) if the incident exists but belongs to a different
// owner. This is deliberate: a logged-out or wrong-user caller must not
// be able to distinguish "doesn't exist" from "exists, not yours" by
// probing incident ids.
```

Both existing implementations already take a `Repository`-shaped
interface consumed identically by every route and Server Component, so
this is a signature change propagated to every call site, not a new
parallel code path.

## Auth

**Library:** `@supabase/ssr` (new dependency) — Supabase's officially
supported package for Next.js App Router session handling via cookies.
Not `@supabase/auth-helpers-nextjs` (deprecated, superseded by `@supabase/ssr`).

**Client-side:** `lib/auth/browser-client.ts` creates a Supabase client
with `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (both
currently blank in `.env` — this feature is their first real use).
`/login` and `/signup` pages call `supabase.auth.signInWithPassword()` /
`supabase.auth.signUp()` directly from a client component. On success,
`@supabase/ssr` has already set the httpOnly session cookie; redirect to
`/incidents`.

**Server-side:** `lib/auth/server-client.ts` creates a per-request
Supabase client from the incoming cookies (via `next/headers`), used in
Server Components and Route Handlers to call `supabase.auth.getUser()`.
This is the **only** source of truth for "who is the caller" server-side
— never trust a client-sent user id in a request body.

**Middleware:** `middleware.ts` (new, project root) protects
`/incidents/upload`: unauthenticated requests redirect to
`/login?next=/incidents/upload`. Everything else (incident list/detail,
investigate, feedback) stays reachable logged-out, since the shared
catalog is public; auth only gates the ability to create/view private
data.

**Session propagation to existing API routes:** routes that need to know
the caller (`GET /api/incidents`, `GET /api/incidents/[id]`, the new
upload route) call the server client's `auth.getUser()` themselves — the
existing `withRequestLog` wrapper is untouched, this is an addition
inside each handler, following the same pattern already used for rate
limiting (`consumeRateLimit` called inside the handler, not via a
separate middleware layer for those routes).

## Upload flow

`POST /api/incidents/upload` (new), authenticated (401 if no session).

Request: `multipart/form-data` with fields:
- `title` (string, required)
- `logFile` (required) — JSON Lines, one `{timestamp, service, level, message}` object per line
- `metricsFile` (optional) — JSON Lines, one `{timestamp, service, metric, value}` object per line

Each line is validated with a zod schema
(`lib/security/validation.ts` gets `uploadedLogLineSchema` /
`uploadedMetricLineSchema` alongside the existing `feedbackRequestSchema`).
A malformed line fails the **entire** upload with a `400` naming the
line number and the validation error — partial/silently-dropped data
would corrupt the evidence catalog silently, which the project already
treats as an anti-goal (see the evidence-citation validation work in the
base design).

On success:
1. Create one `incidents` row: `owner_id` = caller's id, `status: "open"`,
   `severity` = user-selected (form field, default `"sev3"`),
   `started_at` = earliest timestamp across all parsed log lines,
   `resolved_at: null`, `root_cause_truth: null`, `affected_services` =
   the distinct `service` values seen in the log.
2. Bulk-insert the parsed rows via the existing
   `insertLogEvents`/`insertMetricEvents` (already `upsert`-based, so
   this reuses proven code, not new bulk-write logic).
3. Redirect to `/incidents/[id]`, where the existing `InvestigatePanel`
   already works unmodified — investigation is triggered the same way
   for uploaded and seeded incidents.

File size cap: 2MB per file (rejected with 413 before parsing), enough
for tens of thousands of log lines while bounding worst-case parse time
and Supabase insert payload size.

## Pipeline fix

`app/api/incidents/[id]/investigate/route.ts` currently hardcodes
`validRootCauses: [...FAULT_SLUGS]` — the synthetic fault taxonomy —
for every investigation, sourced from `simulator/fault-injection/index`.
For an uploaded incident this is wrong: forcing the LLM to pick from a
taxonomy describing a synthetic system it's never seen produces
meaningless output. Fix: fetch the incident first, and only pass
`validRootCauses` when `incident.ownerId === null` (a seeded incident).
For owned incidents, `generateCandidates` gets no `validRootCauses`
constraint and the LLM returns an open-ended `rootCause` string, exactly
as `GenerateCandidatesInput.validRootCauses` already being optional
supports today.

## UI changes

- `app/login/page.tsx`, `app/signup/page.tsx` — email+password forms,
  client components, redirect to `/incidents` (or `?next=`) on success.
  Errors (wrong password, email taken) shown inline from Supabase's
  returned error message.
- `app/layout.tsx` — nav gets a right-aligned auth slot: signed-out shows
  "Log in"; signed-in shows the user's email + a "Sign out" button
  (calls `supabase.auth.signOut()`, then redirects to `/`).
- `app/incidents/page.tsx` — becomes two sections when logged in: "Shared
  catalog" (existing list, `owner_id IS NULL`) and "Your incidents"
  (`owner_id = you`), each using the existing incident-card rendering.
  Logged-out: only "Shared catalog", plus a prompt to log in to upload.
- `app/incidents/upload/page.tsx` (new) — the upload form (title,
  severity select, two file inputs). Client component; submits
  `multipart/form-data` to the new route, shows the line-numbered
  validation error inline on failure.

## Testing

- `lib/auth/*` — unit tests using a fake Supabase auth client (same
  dependency-injection pattern the project already uses for
  `LLMProvider`/`EmbeddingProvider`/`RateLimiter` fakes), not a real
  network call.
- `lib/security/validation.ts` — new zod schemas get the same
  table-driven valid/invalid test treatment as `feedbackRequestSchema`.
- `lib/db/memory-repository.ts` — `listIncidents`/`getIncident`
  ownership-filtering behavior gets direct unit tests (three owners:
  `null`, user A, user B; assert each sees only what they should).
- `app/api/incidents/upload/route.ts` — integration-style test using the
  existing fake-Supabase-client test infrastructure
  (`tests/db/fake-supabase-client.ts`), covering: happy path, malformed
  log line (line-numbered 400), oversized file (413), unauthenticated
  (401).
- Component tests for the login/signup forms and the upload form,
  following the existing `// @vitest-environment jsdom` +
  `@testing-library/react` pattern used for `FeedbackForm`/`InvestigatePanel`.

## Open items deliberately deferred

- Password reset flow — not requested; Supabase Auth supports it later
  without a schema change.

Note: the upload route **is** rate-limited in the implementation plan,
via the existing `consumeRateLimit` — that's just applying an existing
pattern to a new route, not a new design decision, so it isn't spelled
out as its own section above.
