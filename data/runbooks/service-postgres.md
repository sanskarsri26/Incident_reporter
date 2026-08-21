# Service: postgres

## What it does

The primary relational datastore for the system. `payment-service`
writes and reads payment records here (including within the connection
pool that other faults exhaust), and `checkout-service` reads order
data through `payment-service`'s dependency chain. It is the single
source of truth for transactional state — nothing in this system is
eventually-consistent against postgres; every read reflects the latest
committed write.

## Position in the dependency graph

`payment-service -> postgres`. Nothing else talks to postgres directly
in steady state, though `redis_unavailable` incidents cause
`inventory-service` to fall back to reading it indirectly via increased
`db_load`, since its usual cache layer is down.

## Key metrics

- `active_connections` — current connections held from the application
  pool. Normally stays well under the configured pool limit.
- `query_duration_ms` — per-query execution time. Normally tens of
  milliseconds for the hot-path queries.
- `db_load` — overall load/throughput indicator, most relevant when a
  cache in front of postgres (redis) is unavailable and read volume
  shifts onto postgres directly.

## Known failure modes

- **Connection pool exhaustion** — the application-side pool fills to
  its limit and new requests block/time out. See runbook
  `db_connection_pool_exhaustion.md`.
- **Slow queries** — a missing index, bad plan, or table bloat drives up
  `query_duration_ms` and, transitively, checkout latency. See runbook
  `db_slow_query.md`.
- **Elevated load from cache fallback** — when redis is unavailable,
  read traffic that would normally hit the cache lands on postgres
  instead, raising `db_load`. See runbook `redis_unavailable.md`.
