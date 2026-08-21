# Runbook: Memory leak

## Summary

`payment-service` steadily accumulates memory over its process lifetime
— usually an unbounded cache, a listener/subscription that's never
cleaned up, or objects retained across requests — until it hits its
container memory limit and is OOM-killed and restarted. `checkout-service`
degrades and then errors while payment-service is unhealthy or
restarting.

## Symptoms

- `memory_mb` on `payment-service` climbs steadily and monotonically
  across the whole window — no plateau, no recovery, just a sustained
  climb. This is the key signature that distinguishes it from a normal
  load-driven memory increase, which stabilizes.
- Logs show `heap usage trending upward across GC cycles` and
  `garbage collection pause time increasing` well before the crash.
- Near the end of the window: `memory usage nearing container limit`,
  followed by a `fatal`-level `payment-service out of memory, process
  restarting`.
- Immediately after: `checkout-service` logs `upstream payment-service
  connection refused` while the instance restarts.
- `checkout-service` `latency_ms` rises gradually as GC pauses lengthen,
  then spikes sharply at the restart.

## Diagnostic steps

1. Pull a heap snapshot (or diff two snapshots taken minutes apart)
   before the next restart to identify what's growing — look for caches
   without eviction, retained closures, or accumulating event listeners.
2. Check whether the growth rate correlates with request volume (a leak
   per-request) or is roughly constant (a leak on a timer/background
   job).
3. Review recent deploys to `payment-service` for new caching layers or
   third-party client libraries that could be retaining connections or
   buffers.
4. Confirm the container's memory limit and whether the growth rate
   would explain time-to-OOM.

## Remediation

- Bound any in-process caches with a max size and TTL.
- Ensure listeners/subscriptions are unregistered when their owning
  request or connection ends.
- As an immediate mitigation, add a scheduled restart before the leak
  reaches the OOM threshold while the root cause is fixed.
- Add a memory-usage alert well below the container limit so the leak is
  caught before it OOMs.
