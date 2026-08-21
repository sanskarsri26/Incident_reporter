# Service: redis

## What it does

An in-memory cache used by `inventory-service` to avoid hitting
postgres for every inventory-level read. It holds no data that isn't
recoverable from postgres — redis is a performance optimization, not a
source of truth — which is why `inventory-service` can fall back to
direct database reads when redis is unavailable, rather than failing
outright.

## Position in the dependency graph

`inventory-service -> redis`. It is a leaf dependency with no
downstream calls of its own.

## Key metrics

- `latency_ms` — round-trip time for cache operations. Normally very
  low (single-digit milliseconds).
- Consumer-side signal (`cache_hit_rate` on `inventory-service`) is
  usually a more useful early-warning indicator than any metric on
  redis itself, since a hit-rate collapse shows up the moment redis
  becomes unreachable.

## Known failure modes

- **Unavailability** — process crash, network partition, out-of-memory
  eviction storm, or infrastructure maintenance makes redis
  unreachable. `inventory-service` falls back to postgres, which raises
  `db_load` there as a downstream effect. See runbook
  `redis_unavailable.md`.
- Because redis holds no authoritative data, recovery is typically a
  simple restart/failover — there is no data-consistency remediation
  step involved, unlike a postgres incident.
