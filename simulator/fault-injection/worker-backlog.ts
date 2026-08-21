import type { FaultInjectionResult } from "@/simulator/types";
import { seededRng } from "@/simulator/random";
import { jitteredOffsets, makeLogEvent, makeMetricEvent, monotonicRamp, offsetTimestamp } from "@/simulator/fault-injection/helpers";

export const FAULT_SLUG = "worker_backlog";

export function injectWorkerBacklog(incidentId: string, startedAt: Date): FaultInjectionResult {
  const metricRng = seededRng(incidentId, `${FAULT_SLUG}:metrics`);
  const logRng = seededRng(incidentId, `${FAULT_SLUG}:logs`);

  const metricCount = 22;
  const metricOffsets = jitteredOffsets(metricRng, metricCount, 40);
  const queueDepth = monotonicRamp(metricRng, metricCount, 15, 1450, 0.1);
  const processingDelay = monotonicRamp(metricRng, metricCount, 200, 18000, 0.1);

  const metricEvents = metricOffsets.flatMap((offsetSeconds, i) => [
    makeMetricEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, offsetSeconds),
      service: "payment-service",
      metric: "queue_depth",
      value: queueDepth[i]!,
    }),
    makeMetricEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, offsetSeconds),
      service: "payment-service",
      metric: "processing_delay_ms",
      value: processingDelay[i]!,
    }),
  ]);

  const logOffsets = jitteredOffsets(logRng, 9, 90);
  const logEvents = [
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[0]!),
      service: "payment-service",
      level: "info",
      template: "worker pool processing payment jobs normally",
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[1]!),
      service: "payment-service",
      level: "warn",
      template: "queue depth growing beyond normal range",
      count: 3,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[2]!),
      service: "payment-service",
      level: "warn",
      template: "processing delayed for queued jobs",
      count: 4,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[3]!),
      service: "payment-service",
      level: "warn",
      template: "queue depth growing beyond normal range",
      count: 8,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[4]!),
      service: "payment-service",
      level: "error",
      template: "worker pool unable to keep up with job arrival rate",
      count: 6,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[5]!),
      service: "payment-service",
      level: "warn",
      template: "processing delayed for queued jobs",
      count: 12,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[6]!),
      service: "payment-service",
      level: "error",
      template: "worker pool unable to keep up with job arrival rate",
      count: 14,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[7]!),
      service: "payment-service",
      level: "warn",
      template: "queue depth growing beyond normal range",
      count: 17,
    }),
  ];

  return {
    logEvents,
    metricEvents,
    manifest: {
      incidentId,
      fault: FAULT_SLUG,
      rootService: "payment-service",
      affectedServices: ["payment-service"],
      expectedEvidence: ["queue_depth_growth", "processing_delay_growth"],
      validActions: [
        "inspect worker pool size and throughput",
        "check for stuck or slow jobs blocking the queue",
        "scale worker concurrency",
      ],
    },
  };
}
