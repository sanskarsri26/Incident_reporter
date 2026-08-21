import { describe, it, expect } from "vitest";
import { buildIncidentSummary } from "@/lib/investigation/summary";
import type { Incident, LogEvent, MetricEvent } from "@/lib/types";

const incident: Incident = {
  id: "INC-0042",
  title: "Checkout errors spiking",
  severity: "sev1",
  status: "resolved",
  startedAt: "2026-01-01T10:00:00.000Z",
  resolvedAt: "2026-01-01T10:30:00.000Z",
  rootCauseTruth: "db_connection_pool_exhaustion",
  affectedServices: ["checkout-service", "payment-service"],
};

describe("buildIncidentSummary", () => {
  it("includes core incident fields", () => {
    const summary = buildIncidentSummary(incident, [], []);
    expect(summary).toContain("INC-0042");
    expect(summary).toContain("Checkout errors spiking");
    expect(summary).toContain("sev1");
    expect(summary).toContain("checkout-service, payment-service");
  });

  it("aggregates repeated log templates by count and sorts most frequent first", () => {
    const logEvents: LogEvent[] = [
      { id: "L1", incidentId: "INC-0042", timestamp: "t1", service: "postgres", level: "error", template: "connection timeout", count: 3 },
      { id: "L2", incidentId: "INC-0042", timestamp: "t2", service: "postgres", level: "error", template: "connection timeout", count: 4 },
      { id: "L3", incidentId: "INC-0042", timestamp: "t3", service: "checkout-service", level: "warn", template: "retrying request", count: 1 },
    ];
    const summary = buildIncidentSummary(incident, logEvents, []);
    const lines = summary.split("\n");
    const connectionLine = lines.findIndex((l) => l.includes("connection timeout"));
    const retryLine = lines.findIndex((l) => l.includes("retrying request"));
    expect(connectionLine).toBeGreaterThan(-1);
    expect(connectionLine).toBeLessThan(retryLine);
    expect(summary).toContain("connection timeout (x7)");
  });

  it("shows metric peaks sorted by magnitude", () => {
    const metricEvents: MetricEvent[] = [
      { id: "M1", incidentId: "INC-0042", timestamp: "t1", service: "postgres", metric: "active_connections", value: 18 },
      { id: "M2", incidentId: "INC-0042", timestamp: "t2", service: "postgres", metric: "active_connections", value: 20 },
      { id: "M3", incidentId: "INC-0042", timestamp: "t3", service: "checkout-service", metric: "latency_ms", value: 150 },
    ];
    const summary = buildIncidentSummary(incident, [], metricEvents);
    expect(summary).toContain("postgres active_connections: peak 20 at t2");
    const lines = summary.split("\n");
    const latencyLine = lines.findIndex((l) => l.includes("latency_ms"));
    const connectionsLine = lines.findIndex((l) => l.includes("active_connections"));
    expect(latencyLine).toBeLessThan(connectionsLine);
  });

  it("omits the log/metric sections entirely when there are no events", () => {
    const summary = buildIncidentSummary(incident, [], []);
    expect(summary).not.toContain("Top log signals");
    expect(summary).not.toContain("Metric highlights");
  });
});
