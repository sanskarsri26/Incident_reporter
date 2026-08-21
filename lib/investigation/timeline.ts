import type { LogEvent, MetricEvent } from "@/lib/types";

export type TimelineEntry =
  | { kind: "log"; timestamp: string; service: string; level: LogEvent["level"]; template: string; count: number }
  | { kind: "metric"; timestamp: string; service: string; metric: string; value: number };

export function buildTimeline(logEvents: LogEvent[], metricEvents: MetricEvent[]): TimelineEntry[] {
  const logEntries: TimelineEntry[] = logEvents.map((event) => ({
    kind: "log",
    timestamp: event.timestamp,
    service: event.service,
    level: event.level,
    template: event.template,
    count: event.count,
  }));

  const metricEntries: TimelineEntry[] = metricEvents.map((event) => ({
    kind: "metric",
    timestamp: event.timestamp,
    service: event.service,
    metric: event.metric,
    value: event.value,
  }));

  return [...logEntries, ...metricEntries].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
