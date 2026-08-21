import { describe, it, expect } from "vitest";
import { generateBaselineTraffic } from "@/simulator/traffic/generator";
import { SERVICE_IDS } from "@/simulator/services/graph";

describe("generateBaselineTraffic", () => {
  const incidentId = "INC-BASELINE-0001";
  const startedAt = new Date("2026-03-01T09:00:00.000Z");
  const result = generateBaselineTraffic(incidentId, startedAt, 15);

  it("scopes every event to the given incident id", () => {
    for (const e of [...result.logEvents, ...result.metricEvents]) {
      expect(e.incidentId).toBe(incidentId);
    }
  });

  it("produces a reasonable volume of low-noise signal", () => {
    expect(result.logEvents.length).toBeGreaterThan(10);
    expect(result.metricEvents.length).toBeGreaterThan(10);
  });

  it("covers all six modeled services with at least some signal", () => {
    const servicesWithSignal = new Set([
      ...result.logEvents.map((l) => l.service),
      ...result.metricEvents.map((m) => m.service),
    ]);
    for (const id of SERVICE_IDS) {
      expect(servicesWithSignal.has(id)).toBe(true);
    }
  });

  it("is mostly info-level logs (low noise, nothing alarming)", () => {
    const nonInfo = result.logEvents.filter((l) => l.level !== "info");
    expect(nonInfo.length).toBe(0);
  });

  it("keeps metric values within a sane range around their baselines (no wild spikes)", () => {
    for (const m of result.metricEvents) {
      expect(m.value).toBeGreaterThanOrEqual(0);
      expect(m.value).toBeLessThan(1000);
    }
  });

  it("is deterministic across calls with the same inputs", () => {
    const again = generateBaselineTraffic(incidentId, startedAt, 15);
    expect(again.metricEvents.map((m) => m.value)).toEqual(result.metricEvents.map((m) => m.value));
  });

  it("scales roughly with durationMinutes", () => {
    const short = generateBaselineTraffic("INC-BASELINE-SHORT", startedAt, 5);
    const long = generateBaselineTraffic("INC-BASELINE-LONG", startedAt, 30);
    expect(long.metricEvents.length).toBeGreaterThan(short.metricEvents.length);
  });
});
