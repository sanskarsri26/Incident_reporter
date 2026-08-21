import type { FaultInjectionResult } from "@/simulator/types";
import { seededRng } from "@/simulator/random";
import { jitteredOffsets, makeLogEvent, makeMetricEvent, offsetTimestamp } from "@/simulator/fault-injection/helpers";

export const FAULT_SLUG = "bad_config_deploy";

// Deploy happens roughly a third of the way into the window; error rate
// jumps immediately after it, not gradually. This is the distinguishing
// signature vs. every other fault, which ramps.
const DEPLOY_OFFSET_SECONDS = 240;

export function injectBadConfigDeploy(incidentId: string, startedAt: Date): FaultInjectionResult {
  const metricRng = seededRng(incidentId, `${FAULT_SLUG}:metrics`);
  const logRng = seededRng(incidentId, `${FAULT_SLUG}:logs`);

  const metricCount = 22;
  const metricOffsets = jitteredOffsets(metricRng, metricCount, 40);
  const errorRate = metricOffsets.map((offsetSeconds) => {
    const jitter = metricRng() * 1.2;
    return offsetSeconds < DEPLOY_OFFSET_SECONDS ? 0.4 + jitter : 38 + metricRng() * 8;
  });
  const paymentErrorRate = metricOffsets.map((offsetSeconds) => {
    const jitter = metricRng() * 0.8;
    return offsetSeconds < DEPLOY_OFFSET_SECONDS ? 0.3 + jitter : 22 + metricRng() * 6;
  });

  const metricEvents = metricOffsets.flatMap((offsetSeconds, i) => [
    makeMetricEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, offsetSeconds),
      service: "checkout-service",
      metric: "error_rate",
      value: errorRate[i]!,
    }),
    makeMetricEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, offsetSeconds),
      service: "payment-service",
      metric: "error_rate",
      value: paymentErrorRate[i]!,
    }),
  ]);

  const logOffsets = jitteredOffsets(logRng, 4, 45).map((o) => DEPLOY_OFFSET_SECONDS + o);
  const logEvents = [
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, DEPLOY_OFFSET_SECONDS),
      service: "checkout-service",
      level: "info",
      template: "config_deployed",
      count: 1,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, DEPLOY_OFFSET_SECONDS + 5),
      service: "checkout-service",
      level: "error",
      template: "invalid configuration value for payment_timeout_ms",
      count: 20,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[1]!),
      service: "checkout-service",
      level: "error",
      template: "invalid configuration value for payment_timeout_ms",
      count: 35,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[2]!),
      service: "payment-service",
      level: "error",
      template: "requests from checkout-service failing validation",
      count: 28,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, logOffsets[3]!),
      service: "checkout-service",
      level: "error",
      template: "invalid configuration value for payment_timeout_ms",
      count: 41,
    }),
    makeLogEvent({
      incidentId,
      timestamp: offsetTimestamp(startedAt, DEPLOY_OFFSET_SECONDS - 30),
      service: "checkout-service",
      level: "info",
      template: "checkout API processing requests normally",
    }),
  ];

  return {
    logEvents,
    metricEvents,
    manifest: {
      incidentId,
      fault: FAULT_SLUG,
      rootService: "checkout-service",
      affectedServices: ["checkout-service", "payment-service"],
      expectedEvidence: ["config_deployed", "error_rate_step_change"],
      validActions: [
        "review the latest configuration deployment diff",
        "roll back the last config change",
        "add config validation before deploy",
      ],
    },
  };
}
