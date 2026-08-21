# Observability

This app is a production-incident investigator, so it eats its own dogfood
on basic observability: `lib/observability/request-log.ts`'s `withRequestLog`
wraps four API routes and emits one structured JSON log line per request.

## Log line shape

```json
{
  "routeName": "incidents.investigate",
  "method": "POST",
  "status": 200,
  "durationMs": 842,
  "timestamp": "2026-08-21T18:00:00.000Z"
}
```

Deliberately routing/timing metadata only. It never logs request or response
bodies, headers, or query params -- this app's routes carry potentially
sensitive log/metric evidence text pulled from the incident dataset, so the
logger must never echo any of it.

## Wrapped routes

- `incidents.list` -- `GET /api/incidents`
- `incidents.similar` -- `GET /api/incidents/:id/similar`
- `incidents.investigate` -- `POST /api/incidents/:id/investigate`
- `feedback.create` -- `POST /api/feedback`

## Scope

This writes to `console.log` only -- there is no external log aggregation
service wired up, matching this project's zero-external-accounts posture. A
real deployment would pipe these lines to a log drain (Vercel's own, Datadog,
etc.), which is out of scope here.
