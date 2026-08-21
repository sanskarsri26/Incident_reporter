import { describe, it, expect } from "vitest";
import { injectRedisUnavailable, FAULT_SLUG } from "@/simulator/fault-injection/redis-unavailable";

describe("injectRedisUnavailable", () => {
  const incidentId = "INC-TEST-0006";
  const startedAt = new Date("2026-03-01T10:00:00.000Z");
  const result = injectRedisUnavailable(incidentId, startedAt);

  it("reports correct manifest fields", () => {
    expect(result.manifest.incidentId).toBe(incidentId);
    expect(result.manifest.fault).toBe(FAULT_SLUG);
    expect(result.manifest.rootService).toBe("redis");
    expect(result.manifest.affectedServices).toEqual(["inventory-service"]);
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

  it("has db_load increasing on postgres as fallback traffic grows", () => {
    const series = result.metricEvents
      .filter((m) => m.service === "postgres" && m.metric === "db_load")
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    expect(series.length).toBeGreaterThan(5);
    for (let i = 1; i < series.length; i++) {
      expect(series[i]!.value).toBeGreaterThanOrEqual(series[i - 1]!.value);
    }
    expect(series[series.length - 1]!.value).toBeGreaterThan(series[0]!.value * 2);
  });

  it("has cache connection error logs on inventory-service", () => {
    const templates = result.logEvents.filter((l) => l.service === "inventory-service").map((l) => l.template);
    expect(templates.some((t) => t.includes("redis connection refused"))).toBe(true);
    expect(templates.some((t) => t.includes("falling back to database"))).toBe(true);
  });
});
