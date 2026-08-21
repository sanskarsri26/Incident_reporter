import type { LogEvent, LogLevel, MetricEvent } from "@/lib/types";

/** Timestamp offsetSeconds after startedAt, as an ISO string. */
export function offsetTimestamp(startedAt: Date, offsetSeconds: number): string {
  return new Date(startedAt.getTime() + offsetSeconds * 1000).toISOString();
}

let logCounter = 0;
let metricCounter = 0;

/**
 * Reset the module-local id counters. Only needed so that repeated calls
 * within a single process (e.g. the batch incident generator) don't leak
 * an ever-growing suffix into ids; ids are always further namespaced by
 * incidentId so this is purely cosmetic, but keeping counters small and
 * scoped per-call keeps generated ids readable.
 */
export function resetEventCounters(): void {
  logCounter = 0;
  metricCounter = 0;
}

export function makeLogEvent(params: {
  incidentId: string;
  timestamp: string;
  service: string;
  level: LogLevel;
  template: string;
  count?: number;
}): LogEvent {
  logCounter += 1;
  return {
    id: `${params.incidentId}-LOG-${logCounter}`,
    incidentId: params.incidentId,
    timestamp: params.timestamp,
    service: params.service,
    level: params.level,
    template: params.template,
    count: params.count ?? 1,
  };
}

export function makeMetricEvent(params: {
  incidentId: string;
  timestamp: string;
  service: string;
  metric: string;
  value: number;
}): MetricEvent {
  metricCounter += 1;
  return {
    id: `${params.incidentId}-METRIC-${metricCounter}`,
    incidentId: params.incidentId,
    timestamp: params.timestamp,
    service: params.service,
    metric: params.metric,
    value: Math.round(params.value * 100) / 100,
  };
}

/**
 * Build n evenly-spaced (with small jitter) offsets in seconds, starting
 * at 0, spaced roughly `spacingSeconds` apart.
 */
export function jitteredOffsets(rng: () => number, n: number, spacingSeconds: number, jitterFraction = 0.15): number[] {
  const offsets: number[] = [];
  let current = 0;
  for (let i = 0; i < n; i++) {
    offsets.push(Math.round(current));
    const jitter = (rng() * 2 - 1) * spacingSeconds * jitterFraction;
    current += spacingSeconds + jitter;
  }
  return offsets;
}

/**
 * Produce n values that ramp (non-decreasing, since every step adds a
 * value >= 0) from roughly `start` toward roughly `end`, then plateau
 * with tiny jitter for the remaining fraction of points. Used for faults
 * whose defining signature is a monotonic climb (memory leak, connection
 * pool exhaustion, cpu saturation, queue depth growth). Requires end >= start.
 */
export function monotonicRamp(
  rng: () => number,
  n: number,
  start: number,
  end: number,
  plateauFraction = 0.25,
): number[] {
  if (end < start) {
    throw new Error("monotonicRamp requires end >= start");
  }
  const values: number[] = [];
  let current = start;
  const rampCount = Math.max(1, Math.round(n * (1 - plateauFraction)));
  const totalDelta = end - start;
  const avgStep = totalDelta / rampCount;
  for (let i = 0; i < n; i++) {
    if (i < rampCount) {
      current += Math.max(0, avgStep * (0.5 + rng()));
    } else {
      current += rng() * avgStep * 0.05;
    }
    values.push(current);
  }
  return values;
}

/** Pick a pseudo-random element from a non-empty array using the given rng. */
export function pick<T>(rng: () => number, items: readonly T[]): T {
  const item = items[Math.floor(rng() * items.length)];
  if (item === undefined) throw new Error("pick called on empty array");
  return item;
}
