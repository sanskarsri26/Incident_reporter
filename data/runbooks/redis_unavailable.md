# Runbook: Redis unavailable

## Summary

`inventory-service`'s cache layer (`redis`) becomes unreachable —
process crash, network partition, or resource exhaustion on the redis
host. `inventory-service` falls back to reading directly from
`postgres` for every request that would normally be served from cache,
which drives up database load.

## Symptoms

- `inventory-service` logs `redis response time degraded` followed by
  `redis connection refused`.
- `inventory-service` logs `cache unavailable, falling back to
  database` at growing volume as more request paths hit the fallback.
- `cache_hit_rate` on `inventory-service` collapses toward zero.
- `db_load` on `postgres` climbs (non-decreasing) as fallback reads
  replace what used to be cache hits — this is the key downstream
  signal even though postgres itself isn't the fault's root cause.
- Note: unlike the DB-focused faults, `active_connections` and
  `query_duration_ms` on postgres are not necessarily abnormal; it's
  request *volume* (`db_load`), not query health, that changes here.

## Diagnostic steps

1. Check redis process/host health directly — is it down, out of
   memory (`maxmemory` eviction storms), or unreachable due to a
   network/security-group change?
2. Confirm `inventory-service` is actually falling back correctly
   (rather than erroring outright) by checking its error rate alongside
   `cache_hit_rate`.
3. Watch `db_load` and postgres latency to judge whether the fallback
   traffic is putting postgres itself at risk of a secondary incident.
4. Check for a recent redis deploy, config change, or infrastructure
   maintenance window that lines up with the start of the incident.

## Remediation

- Restore or fail over redis (replica promotion, restart, or
  infrastructure fix depending on cause).
- If sustained, apply backpressure or rate-limit the database fallback
  path so it can't itself trigger a connection-pool or slow-query
  incident.
- Add a redis health check with fast-fail behavior so inventory-service
  detects unavailability quickly rather than waiting out a connection
  timeout per request.
- Review whether a local/in-process short-TTL cache could reduce
  fallback load during future redis outages.
