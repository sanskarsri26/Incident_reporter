import type { FaultInjectionResult } from "@/simulator/types";
import { seededRng } from "@/simulator/random";
import { jitteredOffsets, makeLogEvent, makeMetricEvent, monotonicRamp, offsetTimestamp } from "@/simulator/fault-injection/helpers";

export const FAULT_SLUG = "dependency_timeout";

export function injectDependencyTimeout(incidentId: string, startedAt: Date): FaultInjectionResult {
  const metricRng = seededRng(incidentId, `${FAULT_SLUG}:metrics`);
  const logRng = seededRng(incidentId, `${FAULT_SLUG}:logs`);

  const metricCount = 20;
  const metricOffsets = jitteredOffsets(metricRng, metricCount, 45);
  const checkoutLatency = monotonicRamp(metricRng, metricCount, 70, 5200, 0.25);
  const paymentLatency = monotonicRamp(metricRng, metricCount, 55, 4600, 0.25);

  const metricEvents = metricOffsets.flatMap((offsetSeconds, i) => [
    makeMetricEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, offsetSeconds),
      service: "checkout-service",
      metric: "latency_ms",
      value: checkoutLatency[i]!,
    }),
    makeMetricEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, offsetSeconds),
      service: "payment-service",
      metric: "latency_ms",
      value: paymentLatency[i]!,
    }),
  ]);

  const logOffsets = jitteredOffsets(logRng, 11, 70);
  const logEvents = [
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[0]!),
      service: "checkout-service",
      level: "warn",
      template: "payment-service response time degraded",
      count: 2,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[1]!),
      service: "checkout-service",
      level: "error",
      template: "upstream payment-service timeout",
      count: 4,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[2]!),
      service: "checkout-service",
      level: "warn",
      template: "retrying request to payment-service",
      count: 5,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[3]!),
      service: "checkout-service",
      level: "error",
      template: "upstream payment-service timeout",
      count: 8,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[4]!),
      service: "checkout-service",
      level: "warn",
      template: "retrying request to payment-service",
      count: 9,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[5]!),
      service: "payment-service",
      level: "warn",
      template: "request queue growing, downstream calls slow",
      count: 3,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[6]!),
      service: "checkout-service",
      level: "error",
      template: "upstream payment-service timeout",
      count: 12,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[7]!),
      service: "checkout-service",
      level: "warn",
      template: "retrying request to payment-service",
      count: 13,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[8]!),
      service: "checkout-service",
      level: "error",
      template: "circuit breaker opened for payment-service",
      count: 2,
    }),
  ];

  return {
    logEvents,
    metricEvents,
    manifest: {
      incidentId,
      fault: FAULT_SLUG,
      rootService: "payment-service",
      affectedServices: ["checkout-service"],
      expectedEvidence: ["upstream_timeout", "retry_storm"],
      validActions: [
        "check payment-service health and latency",
        "inspect timeout and retry configuration",
        "verify circuit breaker behavior",
      ],
    },
  };
}
