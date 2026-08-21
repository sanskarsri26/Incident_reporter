import type { Incident, LogEvent, MetricEvent } from "@/lib/types";

const MAX_LOG_SIGNALS = 6;
const MAX_METRIC_HIGHLIGHTS = 6;

export function buildIncidentSummary(incident: Incident, logEvents: LogEvent[], metricEvents: MetricEvent[]): string {
  const lines: string[] = [
    `Incident ${incident.id}: ${incident.title}`,
    `Severity: ${incident.severity}, Status: ${incident.status}`,
    `Started: ${incident.startedAt}${incident.resolvedAt ? `, Resolved: ${incident.resolvedAt}` : ""}`,
    `Affected services: ${incident.affectedServices.join(", ") || "unknown"}`,
  ];

  const logGroups = new Map<string, { service: string; level: string; template: string; count: number }>();
  for (const event of logEvents) {
    const key = `${event.service}|${event.level}|${event.template}`;
    const existing = logGroups.get(key);
    if (existing) {
      existing.count += event.count;
    } else {
      logGroups.set(key, { service: event.service, level: event.level, template: event.template, count: event.count });
    }
  }
  const topLogSignals = [...logGroups.values()].sort((a, b) => b.count - a.count).slice(0, MAX_LOG_SIGNALS);

  if (topLogSignals.length > 0) {
    lines.push("Top log signals:");
    for (const signal of topLogSignals) {
      lines.push(`- [${signal.level}] ${signal.service}: ${signal.template} (x${signal.count})`);
    }
  }

  const metricPeaks = new Map<string, { service: string; metric: string; peakValue: number; peakTimestamp: string }>();
  for (const event of metricEvents) {
    const key = `${event.service}|${event.metric}`;
    const existing = metricPeaks.get(key);
    if (!existing || Math.abs(event.value) > Math.abs(existing.peakValue)) {
      metricPeaks.set(key, { service: event.service, metric: event.metric, peakValue: event.value, peakTimestamp: event.timestamp });
    }
  }
  const topMetrics = [...metricPeaks.values()]
    .sort((a, b) => Math.abs(b.peakValue) - Math.abs(a.peakValue))
    .slice(0, MAX_METRIC_HIGHLIGHTS);

  if (topMetrics.length > 0) {
    lines.push("Metric highlights:");
    for (const metric of topMetrics) {
      lines.push(`- ${metric.service} ${metric.metric}: peak ${metric.peakValue} at ${metric.peakTimestamp}`);
    }
  }

  return lines.join("\n");
}
