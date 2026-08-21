import { describe, it, expect } from "vitest";
import { injectDbConnectionPoolExhaustion, FAULT_SLUG } from "@/simulator/fault-injection/db-connection-pool-exhaustion";

describe("injectDbConnectionPoolExhaustion", () => {
  const incidentId = "INC-TEST-0001";
  const startedAt = new Date("2026-03-01T10:00:00.000Z");
  const result = injectDbConnectionPoolExhaustion(incidentId, startedAt);

  it("reports correct manifest fields", () => {
    expect(result.manifest.incidentId).toBe(incidentId);
    expect(result.manifest.fault).toBe(FAULT_SLUG);
    expect(result.manifest.rootService).toBe("postgres");
    expect(result.manifest.affectedServices).toEqual(["payment-service", "checkout-service"]);
    expect(result.manifest.expectedEvidence.length).toBeGreaterThan(0);
    expect(result.manifest.validActions.length).toBeGreaterThanOrEqual(2);
  });

  it("scopes every event to the given incident id", () => {
    for (const e of [...result.logEvents, ...result.metricEvents]) {
      expect(e.incidentId).toBe(incidentId);
    }
  });

  it("produces enough log and metric events", () => {
    expect(result.logEvents.length).toBeGreaterThanOrEqual(8);
    expect(result.metricEvents.length).toBeGreaterThanOrEqual(15);
  });

  it("has active_connections climbing toward the pool limit (non-decreasing)", () => {
    const series = result.metricEvents
      .filter((m) => m.service === "postgres" && m.metric === "active_connections")
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    expect(series.length).toBeGreaterThan(5);
    for (let i = 1; i < series.length; i++) {
      expect(series[i]!.value).toBeGreaterThanOrEqual(series[i - 1]!.value);
    }
    expect(series[series.length - 1]!.value).toBeGreaterThan(series[0]!.value * 2);
  });

  it("includes connection timeout error logs and worker retry logs", () => {
    const templates = result.logEvents.map((l) => l.template);
    expect(templates.some((t) => t.includes("connection timeout"))).toBe(true);
    expect(templates.some((t) => t.includes("worker retrying"))).toBe(true);
    expect(result.logEvents.some((l) => l.level === "error")).toBe(true);
  });

  it("is deterministic across calls with the same inputs", () => {
    const again = injectDbConnectionPoolExhaustion(incidentId, startedAt);
    expect(again.metricEvents.map((m) => m.value)).toEqual(result.metricEvents.map((m) => m.value));
  });
});
