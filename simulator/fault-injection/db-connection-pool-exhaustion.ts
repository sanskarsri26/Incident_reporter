import type { FaultInjectionResult } from "@/simulator/types";
import { seededRng } from "@/simulator/random";
import { jitteredOffsets, makeLogEvent, makeMetricEvent, monotonicRamp, offsetTimestamp } from "@/simulator/fault-injection/helpers";

export const FAULT_SLUG = "db_connection_pool_exhaustion";

const POOL_LIMIT = 100;

export function injectDbConnectionPoolExhaustion(incidentId: string, startedAt: Date): FaultInjectionResult {
  const metricRng = seededRng(incidentId, `${FAULT_SLUG}:metrics`);
  const logRng = seededRng(incidentId, `${FAULT_SLUG}:logs`);

  const metricCount = 24;
  const metricOffsets = jitteredOffsets(metricRng, metricCount, 40);
  const activeConnections = monotonicRamp(metricRng, metricCount, 18, POOL_LIMIT);
  const paymentLatency = monotonicRamp(metricRng, metricCount, 55, 4200);
  const checkoutLatency = monotonicRamp(metricRng, metricCount, 70, 3100);

  const metricEvents = metricOffsets.flatMap((offsetSeconds, i) => [
    makeMetricEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, offsetSeconds),
      service: "postgres",
      metric: "active_connections",
      value: Math.min(activeConnections[i]!, POOL_LIMIT),
    }),
    makeMetricEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, offsetSeconds),
      service: "payment-service",
      metric: "latency_ms",
      value: paymentLatency[i]!,
    }),
    makeMetricEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, offsetSeconds),
      service: "checkout-service",
      metric: "latency_ms",
      value: checkoutLatency[i]!,
    }),
  ]);

  const logOffsets = jitteredOffsets(logRng, 12, 70);
  const logEvents = [
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[0]!),
      service: "postgres",
      level: "warn",
      template: "active connections approaching pool limit",
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[1]!),
      service: "payment-service",
      level: "warn",
      template: "connection acquisition slow, waiting for pool",
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[2]!),
      service: "postgres",
      level: "error",
      template: "active connections at pool limit",
      count: 3,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[3]!),
      service: "payment-service",
      level: "error",
      template: "connection timeout waiting for pool",
      count: 5,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[4]!),
      service: "payment-service",
      level: "warn",
      template: "worker retrying after connection timeout",
      count: 4,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[5]!),
      service: "checkout-service",
      level: "error",
      template: "upstream payment-service timeout",
      count: 6,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[6]!),
      service: "payment-service",
      level: "error",
      template: "connection timeout waiting for pool",
      count: 9,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[7]!),
      service: "payment-service",
      level: "warn",
      template: "worker retrying after connection timeout",
      count: 11,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[8]!),
      service: "checkout-service",
      level: "error",
      template: "upstream payment-service timeout",
      count: 10,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[9]!),
      service: "postgres",
      level: "error",
      template: "active connections at pool limit",
      count: 8,
    }),
  ];

  return {
    logEvents,
    metricEvents,
    manifest: {
      incidentId,
      fault: FAULT_SLUG,
      rootService: "postgres",
      affectedServices: ["payment-service", "checkout-service"],
      expectedEvidence: ["db_pool_at_limit", "connection_timeout", "worker_retry"],
      validActions: [
        "inspect active and idle database connections",
        "check for long-running transactions",
        "review pool size and connection release behavior",
      ],
    },
  };
}
