import type { FaultInjectionResult } from "@/simulator/types";
import { seededRng } from "@/simulator/random";
import { jitteredOffsets, makeLogEvent, makeMetricEvent, monotonicRamp, offsetTimestamp } from "@/simulator/fault-injection/helpers";

export const FAULT_SLUG = "memory_leak";

export function injectMemoryLeak(incidentId: string, startedAt: Date): FaultInjectionResult {
  const metricRng = seededRng(incidentId, `${FAULT_SLUG}:metrics`);
  const logRng = seededRng(incidentId, `${FAULT_SLUG}:logs`);

  const metricCount = 26;
  const metricOffsets = jitteredOffsets(metricRng, metricCount, 35);
  // Strictly climbing, no plateau: memory leaks keep growing until restart.
  const memoryMb = monotonicRamp(metricRng, metricCount, 320, 1850, 0);
  const checkoutLatency = monotonicRamp(metricRng, metricCount, 60, 900, 0.4);

  const metricEvents = metricOffsets.flatMap((offsetSeconds, i) => [
    makeMetricEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, offsetSeconds),
      service: "payment-service",
      metric: "memory_mb",
      value: memoryMb[i]!,
    }),
    makeMetricEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, offsetSeconds),
      service: "checkout-service",
      metric: "latency_ms",
      value: checkoutLatency[i]!,
    }),
  ]);

  const logOffsets = jitteredOffsets(logRng, 9, 100);
  const lastOffset = metricOffsets[metricOffsets.length - 1]!;
  const logEvents = [
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[0]!),
      service: "payment-service",
      level: "info",
      template: "payment-service started, heap baseline recorded",
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[1]!),
      service: "payment-service",
      level: "warn",
      template: "heap usage trending upward across GC cycles",
      count: 2,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[2]!),
      service: "checkout-service",
      level: "warn",
      template: "checkout API latency elevated",
      count: 3,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[3]!),
      service: "payment-service",
      level: "warn",
      template: "heap usage trending upward across GC cycles",
      count: 6,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[4]!),
      service: "payment-service",
      level: "warn",
      template: "garbage collection pause time increasing",
      count: 5,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[5]!),
      service: "checkout-service",
      level: "warn",
      template: "checkout API latency elevated",
      count: 8,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[6]!),
      service: "payment-service",
      level: "warn",
      template: "memory usage nearing container limit",
      count: 4,
    }),
    // The OOM/restart event lands right near the end of the window, after
    // memory has climbed close to its ceiling.
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, lastOffset - 15),
      service: "payment-service",
      level: "fatal",
      template: "payment-service out of memory, process restarting",
      count: 1,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, lastOffset - 5),
      service: "checkout-service",
      level: "error",
      template: "upstream payment-service connection refused",
      count: 6,
    }),
  ];

  return {
    logEvents,
    metricEvents,
    manifest: {
      incidentId,
      fault: FAULT_SLUG,
      rootService: "payment-service",
      affectedServices: ["payment-service", "checkout-service"],
      expectedEvidence: ["memory_climb", "oom_restart"],
      validActions: [
        "inspect heap and memory usage over time",
        "check for unbounded caches or leaked references",
        "restart the affected instance and monitor recovery",
      ],
    },
  };
}
