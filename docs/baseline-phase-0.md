# Phase 0 Baseline

Recorded 2026-09-11 after completing Phase 0 (security and baseline) of the
incident-platform upgrade, before Phase 1 (domain model) work begins.

## Dependency audit

`npm audit --audit-level=low`

```
found 0 vulnerabilities
```

## Test suite

`npm test`

```
Test Files  67 passed (67)
     Tests  322 passed (322)
  Start at  17:38:57
  Duration  7.11s (transform 1.84s, setup 0ms, import 10.80s, tests 8.91s, environment 15.33s)
```

## Lint

`npm run lint`

```
(no output / exit 0)
```

## Typecheck

`npm run typecheck`

```
(no output / exit 0)
```

## Build

`npm run build`

```
▲ Next.js 16.3.5 (Turbopack)
✓ Running next.config.mjs took 25ms

  Creating an optimized production build ...
✓ Compiled successfully in 824ms
  Running TypeScript ...
  Finished TypeScript in 2.2s ...
  Collecting page data using 7 workers ...
  Generating static pages using 7 workers (0/14) ...
  Generating static pages using 7 workers (3/14) 
  Generating static pages using 7 workers (6/14) 
  Generating static pages using 7 workers (10/14) 
✓ Generating static pages using 7 workers (14/14) in 188ms
  Finalizing page optimization ...

Route (app)
┌ ƒ /
├ ƒ /_not-found
├ ƒ /about
├ ƒ /api/auth/login
├ ƒ /api/auth/logout
├ ƒ /api/auth/signup
├ ƒ /api/evaluation/summary
├ ƒ /api/feedback
├ ƒ /api/health
├ ƒ /api/incidents
├ ƒ /api/incidents/[id]
├ ƒ /api/incidents/[id]/investigate
├ ƒ /api/incidents/[id]/similar
├ ƒ /api/incidents/[id]/timeline
├ ƒ /api/incidents/upload
├ ƒ /evaluation
├ ƒ /incidents
├ ƒ /incidents/[id]
├ ƒ /incidents/[id]/similar
├ ƒ /incidents/upload
├ ƒ /login
└ ƒ /signup


ƒ Proxy (Middleware)

ƒ  (Dynamic)  server-rendered on demand
```

## Secret scan

- `.env`/`.env.local` are gitignored and have never been committed (git log --all -- .env .env.local returns nothing).
- No committed file contains a literal Supabase service-role key or Gemini API key value. The grep search found only test placeholder values ("service-role-key" and "test-key") in test files, confirming no real secrets are exposed.

## What changed in Phase 0

- `next`/`eslint-config-next` bumped 16.3.1 -> 16.3.5, resolving one critical
  (Next.js RCE) and two high-severity (js-yaml, sharp, both transitive)
  advisories.
- The real-database + mock-auth configuration combination now fails fast
  (throws) instead of logging a warning and continuing, both at process
  startup (`instrumentation.ts`) and on every `getAuthProvider()` call.
