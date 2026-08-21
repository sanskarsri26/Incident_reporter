# Runbook: Bad configuration deploy

## Summary

A configuration change is deployed to `checkout-service` (e.g. an
invalid timeout value, a bad feature flag, a malformed connection
string) and errors begin immediately — within seconds — rather than
ramping up gradually. This is the key signature that separates a bad
config deploy from every other fault in this set: there is no climb, no
saturation curve, just a step change right after a `config_deployed`
event.

## Symptoms

- A `config_deployed` info-level log event on `checkout-service` marks
  the exact moment of the change.
- `error_rate` on `checkout-service` jumps from its normal baseline to a
  sustained high value within seconds of `config_deployed` — a step
  function, not a ramp. If you plot `error_rate` over time, the "before"
  and "after" segments are both roughly flat; only the transition
  between them is discontinuous.
- Logs show `invalid configuration value for payment_timeout_ms`
  immediately after the deploy, at high and roughly constant volume.
- `payment-service` also shows an elevated `error_rate` and logs
  `requests from checkout-service failing validation`, because the bad
  config value produces malformed requests to it.

## Diagnostic steps

1. Find the exact deploy event (`config_deployed`) and diff the
   configuration that changed at that moment against the previous known
   good version.
2. Confirm the error onset timestamp lines up with the deploy timestamp
   almost exactly — a gap of more than a few seconds points to a
   different fault (e.g. a slow-building resource leak) rather than a
   bad config.
3. Check whether the invalid value passed any pre-deploy validation, and
   why it didn't.
4. Check blast radius: which other services consume the same
   configuration and might also be affected.

## Remediation

- Roll back to the last known-good configuration immediately — this is
  almost always the fastest mitigation for this fault class.
- Add schema/range validation for configuration values before they can
  be deployed.
- Add a canary or staged rollout for configuration changes so a bad
  value affects a small fraction of traffic before going wide.
- Add an automated correlation alert: error rate step-changes within
  seconds of a deploy event should page immediately.
