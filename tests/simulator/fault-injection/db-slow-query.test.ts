import { describe, it, expect } from "vitest";
import { injectDbSlowQuery, FAULT_SLUG } from "@/simulator/fault-injection/db-slow-query";

describe("injectDbSlowQuery", () => {
  const incidentId = "INC-TEST-0002";
  const startedAt = new Date("2026-03-01T10:00:00.000Z");
  const result = injectDbSlowQuery(incidentId, startedAt);

  it("reports correct manifest fields", () => {
    expect(result.manifest.incidentId).toBe(incidentId);
    expect(result.manifest.fault).toBe(FAULT_SLUG);
    expect(result.manifest.rootService).toBe("postgres");
    expect(result.manifest.affectedServices).toEqual(["checkout-service"]);
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

  it("has query_duration_ms spiking upward on postgres", () => {
    const series = result.metricEvents
      .filter((m) => m.service === "postgres" && m.metric === "query_duration_ms")
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    expect(series.length).toBeGreaterThan(5);
    expect(series[series.length - 1]!.value).toBeGreaterThan(series[0]!.value * 5);
  });

  it("has checkout-service latency_ms increasing alongside the query spike", () => {
    const series = result.metricEvents
      .filter((m) => m.service === "checkout-service" && m.metric === "latency_ms")
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    expect(series.length).toBeGreaterThan(5);
    expect(series[series.length - 1]!.value).toBeGreaterThan(series[0]!.value * 2);
  });

  it("includes slow-query log evidence", () => {
    const templates = result.logEvents.map((l) => l.template);
    expect(templates.some((t) => t.includes("slow query"))).toBe(true);
  });
});
