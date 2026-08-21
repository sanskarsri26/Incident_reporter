# Runbook: CPU spike / saturation

## Summary

`inventory-service` CPU usage ramps up toward saturation — typically
from an inefficient code path, a runaway loop, or a sudden shift in
traffic mix toward an expensive endpoint — and its event loop backs up.
`checkout-service`, which calls inventory-service on the gateway path,
sees growing latency as a direct downstream effect.

## Symptoms

- `cpu_percent` on `inventory-service` climbs steadily (non-decreasing)
  toward saturation, near 100%, rather than a single instantaneous
  jump.
- `inventory-service` `latency_ms` grows alongside CPU, and
  `checkout-service` `latency_ms` grows as a downstream consequence.
- Logs show `cpu utilization high`, then `event loop lag increasing`,
  escalating to `cpu utilization near saturation`.
- `checkout-service` logs `inventory-service response slow`.
- No corresponding change in postgres/redis metrics — this is a compute
  problem local to inventory-service, not a downstream dependency.

## Diagnostic steps

1. Profile `inventory-service` (CPU flamegraph or sampling profiler)
   during the saturation window to find the hot function(s).
2. Check whether the spike correlates with a traffic shift (e.g. a burst
   of requests to a specific expensive endpoint) or a recent deploy.
3. Check instance count and per-instance load distribution — an uneven
   load balancer distribution can saturate one instance while others
   are idle.
4. Rule out a noisy-neighbor problem if inventory-service shares compute
   with other workloads.

## Remediation

- Fix or remove the hot code path (common causes: unbounded
  recursion/loops, synchronous work that should be async, an
  accidentally quadratic algorithm).
- Scale out inventory-service horizontally to spread load while the fix
  ships.
- Add CPU-based autoscaling and an alert threshold well below full
  saturation.
- Add request-level timeouts on the gateway -> inventory-service call so
  a saturated instance degrades gracefully rather than queuing
  indefinitely.
