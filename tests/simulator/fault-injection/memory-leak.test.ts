import { describe, it, expect } from "vitest";
import { injectMemoryLeak, FAULT_SLUG } from "@/simulator/fault-injection/memory-leak";

describe("injectMemoryLeak", () => {
  const incidentId = "INC-TEST-0003";
  const startedAt = new Date("2026-03-01T10:00:00.000Z");
  const result = injectMemoryLeak(incidentId, startedAt);

  it("reports correct manifest fields", () => {
    expect(result.manifest.incidentId).toBe(incidentId);
    expect(result.manifest.fault).toBe(FAULT_SLUG);
    expect(result.manifest.rootService).toBe("payment-service");
    expect(result.manifest.affectedServices).toEqual(["payment-service", "checkout-service"]);
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

  it("has memory_mb strictly monotonically increasing on payment-service", () => {
    const series = result.metricEvents
      .filter((m) => m.service === "payment-service" && m.metric === "memory_mb")
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    expect(series.length).toBeGreaterThan(10);
    for (let i = 1; i < series.length; i++) {
      expect(series[i]!.value).toBeGreaterThan(series[i - 1]!.value);
    }
  });

  it("has an OOM/restart fatal log event near the end", () => {
    const oom = result.logEvents.find((l) => l.template.includes("out of memory"));
    expect(oom).toBeDefined();
    expect(oom?.level).toBe("fatal");

    const sortedLogs = [...result.logEvents].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const oomIndex = sortedLogs.findIndex((l) => l.template.includes("out of memory"));
    expect(oomIndex).toBeGreaterThanOrEqual(Math.floor(sortedLogs.length * 0.5));
  });
});
