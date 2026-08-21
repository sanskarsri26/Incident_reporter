# Runbook: Worker queue backlog

## Summary

`payment-service`'s background worker pool falls behind the rate jobs
are being enqueued — usually because a downstream call each job makes
has slowed down, or worker concurrency was reduced/misconfigured — so
the job queue grows and per-job processing delay grows with it. Unlike
connection pool exhaustion or dependency timeout, this fault is
contained to `payment-service`'s own async processing path rather than
its synchronous request path.

## Symptoms

- `queue_depth` on `payment-service` grows steadily (non-decreasing)
  from a small baseline to a large backlog.
- `processing_delay_ms` on `payment-service` grows in step with
  `queue_depth` — jobs are waiting longer and longer before a worker
  picks them up.
- Logs show `queue depth growing beyond normal range` and `processing
  delayed for queued jobs`, escalating to `worker pool unable to keep up
  with job arrival rate`.
- Synchronous request-path metrics (`checkout-service` latency, postgres
  connections) are largely unaffected — this fault is specific to the
  async/background path.

## Diagnostic steps

1. Check worker pool size/concurrency configuration against current job
   arrival rate — was concurrency reduced by a recent deploy or
   autoscaling policy change?
2. Check whether individual jobs are taking longer than usual (a
   per-job slowdown, e.g. a downstream call each job makes has gotten
   slower) versus arrival rate simply exceeding normal capacity.
3. Look for stuck jobs — a job that never completes or retries in a
   tight loop can block a worker slot indefinitely.
4. Check for job-type skew: a burst of an unusually expensive job type
   can back up the whole queue even at normal job counts.

## Remediation

- Scale worker concurrency to match arrival rate.
- Add a per-job timeout so a stuck job can't hold a worker slot forever.
- If a downstream dependency is the real bottleneck, treat this as a
  symptom and address that dependency directly.
- Add alerting on `queue_depth` and `processing_delay_ms` trend (not
  just absolute value) to catch backlog growth before it's severe.
