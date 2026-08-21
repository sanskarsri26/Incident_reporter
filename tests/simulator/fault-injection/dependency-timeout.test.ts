import { describe, it, expect } from "vitest";
import { injectDependencyTimeout, FAULT_SLUG } from "@/simulator/fault-injection/dependency-timeout";

describe("injectDependencyTimeout", () => {
  const incidentId = "INC-TEST-0004";
  const startedAt = new Date("2026-03-01T10:00:00.000Z");
  const result = injectDependencyTimeout(incidentId, startedAt);

  it("reports correct manifest fields", () => {
    expect(result.manifest.incidentId).toBe(incidentId);
    expect(result.manifest.fault).toBe(FAULT_SLUG);
    expect(result.manifest.rootService).toBe("payment-service");
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

  it("has checkout-service latency_ms spiking upward", () => {
    const series = result.metricEvents
      .filter((m) => m.service === "checkout-service" && m.metric === "latency_ms")
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    expect(series.length).toBeGreaterThan(5);
    expect(series[series.length - 1]!.value).toBeGreaterThan(series[0]!.value * 3);
  });

  it("includes upstream timeout and retry log evidence on checkout-service", () => {
    const checkoutLogs = result.logEvents.filter((l) => l.service === "checkout-service");
    expect(checkoutLogs.some((l) => l.template.includes("upstream payment-service timeout"))).toBe(true);
    expect(checkoutLogs.some((l) => l.template.includes("retrying request"))).toBe(true);
  });
});
