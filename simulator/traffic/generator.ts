import type { LogEvent, MetricEvent } from "@/lib/types";
import { seededRng } from "@/simulator/random";
import { makeLogEvent, makeMetricEvent, offsetTimestamp } from "@/simulator/fault-injection/helpers";
import { SERVICE_IDS } from "@/simulator/services/graph";

interface BaselineProfile {
  metric: string;
  base: number;
  jitterFraction: number;
}

/** Roughly realistic steady-state metric per service, used to pad incidents with normal signal. */
const BASELINE_METRICS: Record<string, BaselineProfile[]> = {
  gateway: [{ metric: "latency_ms", base: 35, jitterFraction: 0.2 }],
  "checkout-service": [
    { metric: "latency_ms", base: 80, jitterFraction: 0.15 },
    { metric: "error_rate", base: 0.4, jitterFraction: 0.5 },
  ],
  "payment-service": [
    { metric: "latency_ms", base: 60, jitterFraction: 0.15 },
    { metric: "memory_mb", base: 310, jitterFraction: 0.05 },
  ],
  "inventory-service": [
    { metric: "cpu_percent", base: 18, jitterFraction: 0.25 },
    { metric: "latency_ms", base: 40, jitterFraction: 0.2 },
  ],
  postgres: [
    { metric: "active_connections", base: 20, jitterFraction: 0.2 },
    { metric: "query_duration_ms", base: 15, jitterFraction: 0.2 },
  ],
  redis: [{ metric: "latency_ms", base: 2, jitterFraction: 0.3 }],
};

const BASELINE_LOG_TEMPLATES: Record<string, string> = {
  gateway: "request routed successfully",
  "checkout-service": "checkout request completed",
  "payment-service": "payment processed successfully",
  "inventory-service": "inventory lookup completed",
  postgres: "query completed within expected latency",
  redis: "cache hit",
};

export function generateBaselineTraffic(
  incidentId: string,
  startedAt: Date,
  durationMinutes: number,
): { logEvents: LogEvent[]; metricEvents: MetricEvent[] } {
  const durationSeconds = durationMinutes * 60;
  const metricRng = seededRng(incidentId, "baseline:metrics");
  const logRng = seededRng(incidentId, "baseline:logs");

  const metricEvents: MetricEvent[] = [];
  for (const service of SERVICE_IDS) {
    const profiles = BASELINE_METRICS[service] ?? [];
    for (const profile of profiles) {
      for (let offsetSeconds = 0; offsetSeconds <= durationSeconds; offsetSeconds += 60) {
        const jitter = (metricRng() * 2 - 1) * profile.base * profile.jitterFraction;
        const value = Math.max(0, profile.base + jitter);
        metricEvents.push(
          makeMetricEvent({
            incidentId,
            timestamp: offsetTimestamp(startedAt, offsetSeconds),
            service,
            metric: profile.metric,
            value,
          }),
        );
      }
    }
  }

  const logEvents: LogEvent[] = [];
  for (const service of SERVICE_IDS) {
    const template = BASELINE_LOG_TEMPLATES[service];
    if (!template) continue;
    for (let offsetSeconds = 0; offsetSeconds <= durationSeconds; offsetSeconds += 150) {
      const jitter = Math.round((logRng() * 2 - 1) * 20);
      logEvents.push(
        makeLogEvent({
          incidentId,
          timestamp: offsetTimestamp(startedAt, offsetSeconds + jitter),
          service,
          level: "info",
          template,
          count: 1 + Math.floor(logRng() * 5),
        }),
      );
    }
  }

  return { logEvents, metricEvents };
}
