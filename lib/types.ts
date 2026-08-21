export const SEVERITIES = ["sev1", "sev2", "sev3", "sev4"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const INCIDENT_STATUSES = ["open", "investigating", "resolved"] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export interface Incident {
  id: string;
  title: string;
  severity: Severity;
  status: IncidentStatus;
  startedAt: string;
  resolvedAt: string | null;
  rootCauseTruth: string;
  affectedServices: string[];
}

export interface Service {
  id: string;
  name: string;
  type: string;
}

export interface ServiceDependency {
  sourceService: string;
  targetService: string;
}

export const LOG_LEVELS = ["debug", "info", "warn", "error", "fatal"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface LogEvent {
  id: string;
  incidentId: string;
  timestamp: string;
  service: string;
  level: LogLevel;
  template: string;
  count: number;
}

export interface MetricEvent {
  id: string;
  incidentId: string;
  timestamp: string;
  service: string;
  metric: string;
  value: number;
}

export const DOC_TYPES = ["runbook", "service_description", "postmortem"] as const;
export type DocType = (typeof DOC_TYPES)[number];

export interface DocumentRecord {
  id: string;
  title: string;
  body: string;
  docType: DocType;
  embedding: number[] | null;
}

export interface AnalysisRun {
  id: string;
  incidentId: string;
  model: string;
  promptVersion: string;
  latencyMs: number;
  status: "succeeded" | "failed";
  createdAt: string;
}

export interface Prediction {
  id: string;
  analysisRunId: string;
  rootCause: string;
  rank: number;
  confidence: number;
}

export const EVIDENCE_SOURCE_TYPES = ["log_event", "metric_event", "document", "incident"] as const;
export type EvidenceSourceType = (typeof EVIDENCE_SOURCE_TYPES)[number];

export const EVIDENCE_SUPPORT_TYPES = ["supporting", "contradicting"] as const;
export type EvidenceSupportType = (typeof EVIDENCE_SUPPORT_TYPES)[number];

export interface Evidence {
  id: string;
  predictionId: string;
  sourceType: EvidenceSourceType;
  sourceId: string;
  supportType: EvidenceSupportType;
}

export interface Recommendation {
  id: string;
  analysisRunId: string;
  action: string;
  priority: number;
}
