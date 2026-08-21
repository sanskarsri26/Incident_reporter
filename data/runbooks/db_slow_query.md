# Runbook: Slow database query

## Summary

One or more queries against `postgres` — most often the checkout order
lookup — start taking far longer than normal, usually due to a missing
index, a bad plan after a data-distribution change, or table bloat.
Because `checkout-service` calls postgres synchronously (via
`payment-service`'s dependency chain and directly for order reads),
elevated query time shows up immediately as elevated API latency.

## Symptoms

- `query_duration_ms` on postgres spikes from a normal baseline (tens of
  milliseconds) to seconds.
- `checkout-service` `latency_ms` rises in the same window, tracking the
  query duration increase.
- postgres logs `slow query detected on checkout_orders table` and,
  often, `query execution plan missing index scan`.
- `checkout-service` logs `checkout API latency elevated`.
- Unlike a connection pool exhaustion incident, `active_connections`
  stays roughly normal — connections aren't blocked, they're just slow.

## Diagnostic steps

1. Pull `pg_stat_statements` (or slow query log) for the affected time
   window and identify the specific query/queries whose mean duration
   jumped.
2. Run `EXPLAIN ANALYZE` on the offending query to see whether it's
   doing a sequential scan where an index scan is expected.
3. Check for recent schema changes, dropped indexes, or a sudden shift
   in table size/data distribution (e.g. a large backfill).
4. Check autovacuum status — heavy bloat on the table can degrade plan
   choice and I/O cost even with the right indexes.

## Remediation

- Add or restore the missing index; re-run `ANALYZE` on the table so the
  planner has fresh statistics.
- If the query can't be made fast enough, add a cache in front of it or
  move it off the synchronous request path.
- Set a statement timeout so a slow query degrades gracefully instead of
  stacking up concurrent slow requests.
- Track `query_duration_ms` per query fingerprint so regressions are
  caught before they become incidents.
