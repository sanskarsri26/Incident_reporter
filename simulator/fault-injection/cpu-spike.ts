import type { FaultInjectionResult } from "@/simulator/types";
import { seededRng } from "@/simulator/random";
import { jitteredOffsets, makeLogEvent, makeMetricEvent, monotonicRamp, offsetTimestamp } from "@/simulator/fault-injection/helpers";

export const FAULT_SLUG = "cpu_spike";

export function injectCpuSpike(incidentId: string, startedAt: Date): FaultInjectionResult {
  const metricRng = seededRng(incidentId, `${FAULT_SLUG}:metrics`);
  const logRng = seededRng(incidentId, `${FAULT_SLUG}:logs`);

  const metricCount = 22;
  const metricOffsets = jitteredOffsets(metricRng, metricCount, 40);
  const cpuPercent = monotonicRamp(metricRng, metricCount, 22, 97, 0.15).map((v) => Math.min(v, 99));
  const inventoryLatency = monotonicRamp(metricRng, metricCount, 45, 2100, 0.2);
  const checkoutLatency = monotonicRamp(metricRng, metricCount, 65, 1400, 0.2);

  const metricEvents = metricOffsets.flatMap((offsetSeconds, i) => [
    makeMetricEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, offsetSeconds),
      service: "inventory-service",
      metric: "cpu_percent",
      value: cpuPercent[i]!,
    }),
    makeMetricEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, offsetSeconds),
      service: "inventory-service",
      metric: "latency_ms",
      value: inventoryLatency[i]!,
    }),
    makeMetricEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, offsetSeconds),
      service: "checkout-service",
      metric: "latency_ms",
      value: checkoutLatency[i]!,
    }),
  ]);

  const logOffsets = jitteredOffsets(logRng, 10, 80);
  const logEvents = [
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[0]!),
      service: "inventory-service",
      level: "warn",
      template: "cpu utilization high",
      count: 2,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[1]!),
      service: "inventory-service",
      level: "warn",
      template: "event loop lag increasing",
      count: 3,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[2]!),
      service: "checkout-service",
      level: "warn",
      template: "inventory-service response slow",
      count: 4,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[3]!),
      service: "inventory-service",
      level: "warn",
      template: "cpu utilization high",
      count: 7,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[4]!),
      service: "inventory-service",
      level: "error",
      template: "cpu utilization near saturation",
      count: 6,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[5]!),
      service: "checkout-service",
      level: "warn",
      template: "inventory-service response slow",
      count: 9,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[6]!),
      service: "inventory-service",
      level: "error",
      template: "cpu utilization near saturation",
      count: 11,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[7]!),
      service: "inventory-service",
      level: "warn",
      template: "event loop lag increasing",
      count: 12,
    }),
  ];

  return {
    logEvents,
    metricEvents,
    manifest: {
      incidentId,
      fault: FAULT_SLUG,
      rootService: "inventory-service",
      affectedServices: ["inventory-service", "checkout-service"],
      expectedEvidence: ["cpu_saturation", "downstream_latency_growth"],
      validActions: [
        "profile inventory-service cpu usage",
        "check for inefficient loops or a recent deploy",
        "consider scaling out inventory-service",
      ],
    },
  };
}
