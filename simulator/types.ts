import type { LogEvent, MetricEvent } from "@/lib/types";

/**
 * The labeled ground truth for one simulated incident. This is what makes
 * the generated dataset usable for evaluation: it records exactly which
 * fault was injected, which service caused it, which services it should
 * be observed to affect, which evidence tags a correct investigation
 * should surface, and which remediation actions would be considered valid.
 */
export interface GroundTruthManifest {
  incidentId: string;
  fault: string;
  rootService: string;
  affectedServices: string[];
  expectedEvidence: string[];
  validActions: string[];
}

/** Output of a single fault injector: the events it produced plus its ground truth. */
export interface FaultInjectionResult {
  logEvents: LogEvent[];
  metricEvents: MetricEvent[];
  manifest: GroundTruthManifest;
}

/** A fault injector is a pure function of an incident id and a start time. */
export type FaultInjector = (incidentId: string, startedAt: Date) => FaultInjectionResult;
