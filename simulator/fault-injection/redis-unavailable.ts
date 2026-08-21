import type { FaultInjectionResult } from "@/simulator/types";
import { seededRng } from "@/simulator/random";
import { jitteredOffsets, makeLogEvent, makeMetricEvent, monotonicRamp, offsetTimestamp } from "@/simulator/fault-injection/helpers";

export const FAULT_SLUG = "redis_unavailable";

export function injectRedisUnavailable(incidentId: string, startedAt: Date): FaultInjectionResult {
  const metricRng = seededRng(incidentId, `${FAULT_SLUG}:metrics`);
  const logRng = seededRng(incidentId, `${FAULT_SLUG}:logs`);

  const metricCount = 20;
  const metricOffsets = jitteredOffsets(metricRng, metricCount, 45);
  // As redis goes unreachable, inventory-service falls back to postgres,
  // driving db_load up on postgres, while its own cache_hit_rate collapses.
  const dbLoad = monotonicRamp(metricRng, metricCount, 25, 88, 0.2);
  const cacheHitRateDecline = monotonicRamp(metricRng, metricCount, 0, 92, 0);
  const cacheHitRate = cacheHitRateDecline.map((v) => Math.max(0, 92 - v));

  const metricEvents = metricOffsets.flatMap((offsetSeconds, i) => [
    makeMetricEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, offsetSeconds),
      service: "postgres",
      metric: "db_load",
      value: dbLoad[i]!,
    }),
    makeMetricEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, offsetSeconds),
      service: "inventory-service",
      metric: "cache_hit_rate",
      value: cacheHitRate[i]!,
    }),
  ]);

  const logOffsets = jitteredOffsets(logRng, 9, 80);
  const logEvents = [
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[0]!),
      service: "inventory-service",
      level: "warn",
      template: "redis response time degraded",
      count: 2,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[1]!),
      service: "inventory-service",
      level: "error",
      template: "redis connection refused",
      count: 5,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[2]!),
      service: "inventory-service",
      level: "warn",
      template: "cache unavailable, falling back to database",
      count: 6,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[3]!),
      service: "inventory-service",
      level: "error",
      template: "redis connection refused",
      count: 10,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[4]!),
      service: "inventory-service",
      level: "warn",
      template: "cache unavailable, falling back to database",
      count: 13,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[5]!),
      service: "inventory-service",
      level: "error",
      template: "redis connection refused",
      count: 15,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[6]!),
      service: "inventory-service",
      level: "warn",
      template: "database load increasing due to cache fallback",
      count: 7,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[7]!),
      service: "inventory-service",
      level: "error",
      template: "cache unavailable, falling back to database",
      count: 17,
    }),
  ];

  return {
    logEvents,
    metricEvents,
    manifest: {
      incidentId,
      fault: FAULT_SLUG,
      rootService: "redis",
      affectedServices: ["inventory-service"],
      expectedEvidence: ["cache_connection_error", "db_load_increase"],
      validActions: [
        "check redis process and network health",
        "verify connectivity between inventory-service and redis",
        "review fallback-to-database behavior and its load impact",
      ],
    },
  };
}
