import { describe, it, expect } from "vitest";
import { buildTimeline } from "@/lib/investigation/timeline";
import type { LogEvent, MetricEvent } from "@/lib/types";

describe("buildTimeline", () => {
  it("merges log and metric events sorted by timestamp ascending", () => {
    const logEvents: LogEvent[] = [
      { id: "L1", incidentId: "INC-1", timestamp: "2026-01-01T10:05:00.000Z", service: "postgres", level: "error", template: "timeout", count: 1 },
    ];
    const metricEvents: MetricEvent[] = [
      { id: "M1", incidentId: "INC-1", timestamp: "2026-01-01T10:00:00.000Z", service: "postgres", metric: "active_connections", value: 20 },
    ];

    const timeline = buildTimeline(logEvents, metricEvents);
    expect(timeline).toHaveLength(2);
    expect(timeline[0]?.kind).toBe("metric");
    expect(timeline[1]?.kind).toBe("log");
  });

  it("returns an empty array when there are no events", () => {
    expect(buildTimeline([], [])).toEqual([]);
  });
});
