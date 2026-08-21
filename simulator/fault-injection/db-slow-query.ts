import type { FaultInjectionResult } from "@/simulator/types";
import { seededRng } from "@/simulator/random";
import { jitteredOffsets, makeLogEvent, makeMetricEvent, monotonicRamp, offsetTimestamp } from "@/simulator/fault-injection/helpers";

export const FAULT_SLUG = "db_slow_query";

export function injectDbSlowQuery(incidentId: string, startedAt: Date): FaultInjectionResult {
  const metricRng = seededRng(incidentId, `${FAULT_SLUG}:metrics`);
  const logRng = seededRng(incidentId, `${FAULT_SLUG}:logs`);

  const metricCount = 22;
  const metricOffsets = jitteredOffsets(metricRng, metricCount, 40);
  const queryDuration = monotonicRamp(metricRng, metricCount, 18, 2400, 0.2);
  const checkoutLatency = monotonicRamp(metricRng, metricCount, 65, 2800, 0.2);

  const metricEvents = metricOffsets.flatMap((offsetSeconds, i) => [
    makeMetricEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, offsetSeconds),
      service: "postgres",
      metric: "query_duration_ms",
      value: queryDuration[i]!,
    }),
    makeMetricEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, offsetSeconds),
      service: "checkout-service",
      metric: "latency_ms",
      value: checkoutLatency[i]!,
    }),
  ]);

  const logOffsets = jitteredOffsets(logRng, 10, 90);
  const logEvents = [
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[0]!),
      service: "postgres",
      level: "warn",
      template: "slow query detected on checkout_orders table",
      count: 2,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[1]!),
      service: "checkout-service",
      level: "warn",
      template: "checkout API latency elevated",
      count: 3,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[2]!),
      service: "postgres",
      level: "warn",
      template: "slow query detected on checkout_orders table",
      count: 5,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[3]!),
      service: "postgres",
      level: "warn",
      template: "query execution plan missing index scan",
      count: 4,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[4]!),
      service: "checkout-service",
      level: "warn",
      template: "checkout API latency elevated",
      count: 7,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[5]!),
      service: "postgres",
      level: "error",
      template: "slow query detected on checkout_orders table",
      count: 9,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[6]!),
      service: "checkout-service",
      level: "warn",
      template: "checkout API latency elevated",
      count: 10,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[7]!),
      service: "postgres",
      level: "error",
      template: "query execution plan missing index scan",
      count: 6,
    }),
  ];

  return {
    logEvents,
    metricEvents,
    manifest: {
      incidentId,
      fault: FAULT_SLUG,
      rootService: "postgres",
      affectedServices: ["checkout-service"],
      expectedEvidence: ["query_duration_spike", "checkout_latency_increase"],
      validActions: [
        "review slow query logs and execution plans",
        "check for missing indexes",
        "consider query timeout or caching",
      ],
    },
  };
}
