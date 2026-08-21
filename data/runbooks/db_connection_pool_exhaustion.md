# Runbook: Database connection pool exhaustion

## Summary

The application-side connection pool to Postgres fills up and stays at its
configured limit. New requests block waiting for a connection, then time
out. This most commonly affects `payment-service`, which holds the
longest-lived transactions against `postgres`, and cascades to
`checkout-service` because it calls `payment-service` synchronously.

## Symptoms

- `active_connections` on postgres climbs steadily and plateaus at the
  configured pool limit (log/metric: `active connections at pool limit`).
- `payment-service` logs `connection timeout waiting for pool` and
  `connection acquisition slow, waiting for pool`.
- `payment-service` logs repeated `worker retrying after connection
  timeout` as callers retry failed acquisitions.
- `checkout-service` sees `upstream payment-service timeout` errors and
  its own `latency_ms` rises in lockstep with payment-service's.
- No corresponding drop in query throughput on postgres itself — the
  database is healthy, it's simply out of available connections.

## Diagnostic steps

1. Query `pg_stat_activity` on postgres to see current connection count,
   state (`active`, `idle`, `idle in transaction`), and how long each
   connection has been open.
2. Look for long-running or abandoned transactions (`idle in
   transaction` for more than a few seconds is a red flag).
3. Check `payment-service`'s configured pool size vs. its instance count
   — a pool size that's too small for the current replica count, or too
   large relative to postgres's `max_connections`, both cause this.
4. Correlate the start of `active_connections` climbing with any recent
   deploy, traffic spike, or slow-query incident that could hold
   connections open longer than usual.

## Remediation

- Kill or roll back any long-running/abandoned transactions holding
  connections open.
- Increase pool size only if postgres has headroom under
  `max_connections`; otherwise reduce it and add backpressure.
- Ensure connections are always released (finally-blocks / connection
  middleware) even on error paths.
- Add alerting on `active_connections` approaching the pool limit before
  it saturates.
