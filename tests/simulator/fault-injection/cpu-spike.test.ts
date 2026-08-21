import { describe, it, expect } from "vitest";
import { injectCpuSpike, FAULT_SLUG } from "@/simulator/fault-injection/cpu-spike";

describe("injectCpuSpike", () => {
  const incidentId = "INC-TEST-0005";
  const startedAt = new Date("2026-03-01T10:00:00.000Z");
  const result = injectCpuSpike(incidentId, startedAt);

  it("reports correct manifest fields", () => {
    expect(result.manifest.incidentId).toBe(incidentId);
    expect(result.manifest.fault).toBe(FAULT_SLUG);
    expect(result.manifest.rootService).toBe("inventory-service");
    expect(result.manifest.affectedServices).toEqual(["inventory-service", "checkout-service"]);
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

  it("has cpu_percent ramping up (non-decreasing) and saturating near 100 on inventory-service", () => {
    const series = result.metricEvents
      .filter((m) => m.service === "inventory-service" && m.metric === "cpu_percent")
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    expect(series.length).toBeGreaterThan(5);
    for (let i = 1; i < series.length; i++) {
      expect(series[i]!.value).toBeGreaterThanOrEqual(series[i - 1]!.value);
    }
    expect(series[series.length - 1]!.value).toBeGreaterThan(85);
    expect(series[series.length - 1]!.value).toBeLessThanOrEqual(100);
  });

  it("has growing latency_ms on the dependent checkout-service", () => {
    const series = result.metricEvents
      .filter((m) => m.service === "checkout-service" && m.metric === "latency_ms")
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    expect(series[series.length - 1]!.value).toBeGreaterThan(series[0]!.value * 2);
  });
});
