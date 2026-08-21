# Service: payment-service

## What it does

Processes payment transactions on behalf of `checkout-service` and
persists them to `postgres`. It also runs a background worker pool that
processes queued payment jobs (settlement, retries, notifications)
asynchronously from the request path. It is the most failure-prone
service in this system in practice: three of the eight modeled faults
root-cause here (`memory_leak`, `dependency_timeout`, `worker_backlog`),
and two more (`db_connection_pool_exhaustion`, `bad_config_deploy`) list
it as an affected downstream service.

## Position in the dependency graph

`checkout-service -> payment-service -> postgres`. It sits between
checkout-service and postgres on the critical payment path, and also
owns its own independent async job queue that doesn't go through
checkout-service at all.

## Key metrics

- `latency_ms` — request-handling latency for synchronous calls from
  checkout-service.
- `memory_mb` — process memory usage; should be roughly stable under
  steady load, not climbing.
- `queue_depth` / `processing_delay_ms` — health of the background
  worker pool, independent of the synchronous request path.
- `error_rate` — request error rate, notably relevant during
  `bad_config_deploy` incidents where checkout-service sends it
  malformed requests.

## Known failure modes

- **Memory leak** — unbounded memory growth leading to an OOM restart.
  See runbook `memory_leak.md`.
- **Slow/unavailable itself, causing checkout-service timeouts** — see
  runbook `dependency_timeout.md`.
- **Worker queue backlog** — its async job processing falls behind
  arrival rate. See runbook `worker_backlog.md`.
- **Connection pool exhaustion against postgres** — it holds the pool
  connections that get exhausted. See runbook
  `db_connection_pool_exhaustion.md`.
- **Downstream impact from checkout-service config errors** — a bad
  config deploy on checkout-service can send it malformed requests. See
  runbook `bad_config_deploy.md`.
