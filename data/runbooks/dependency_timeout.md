# Runbook: Downstream dependency timeout

## Summary

`payment-service` becomes slow (not down) and calls from
`checkout-service` start exceeding their timeout budget. Retries pile on
top of an already-overloaded dependency, which usually makes the
underlying slowness worse rather than better, until a circuit breaker
trips.

## Symptoms

- `checkout-service` `latency_ms` and `payment-service` `latency_ms`
  both climb, with checkout-service climbing faster since it also pays
  the retry cost.
- `checkout-service` logs `payment-service response time degraded`,
  followed by repeated `upstream payment-service timeout` errors.
- `checkout-service` logs `retrying request to payment-service` at
  growing volume — a retry storm rather than a single failure.
- `payment-service` itself logs `request queue growing, downstream
  calls slow`, indicating it's backed up rather than crashed.
- Late in the window, `checkout-service` logs `circuit breaker opened
  for payment-service`.

## Diagnostic steps

1. Check `payment-service`'s own health and latency independent of
   checkout-service's view of it — is it actually degraded, or is the
   network path between the two services the problem?
2. Compare the retry volume against the underlying error/timeout
   volume: a retry multiplier much greater than 1 confirms a retry
   storm is amplifying load on the already-slow dependency.
3. Review the configured timeout and retry policy (timeout value, retry
   count, backoff) for the checkout -> payment call path.
4. Check whether a circuit breaker or bulkhead is configured, and
   whether it tripped as expected.

## Remediation

- Add or tighten a circuit breaker so retries stop amplifying load onto
  an already-struggling dependency.
- Use exponential backoff with jitter instead of immediate retries.
- Investigate and fix payment-service's underlying slowness (often one
  of the other faults in this runbook set: pool exhaustion, slow query,
  CPU, or memory).
- Consider a bulkhead (separate connection/thread pool per downstream)
  so one slow dependency can't exhaust shared resources.
