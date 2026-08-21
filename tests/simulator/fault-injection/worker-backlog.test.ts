import { describe, it, expect } from "vitest";
import { injectWorkerBacklog, FAULT_SLUG } from "@/simulator/fault-injection/worker-backlog";

describe("injectWorkerBacklog", () => {
  const incidentId = "INC-TEST-0007";
  const startedAt = new Date("2026-03-01T10:00:00.000Z");
  const result = injectWorkerBacklog(incidentId, startedAt);

  it("reports correct manifest fields", () => {
    expect(result.manifest.incidentId).toBe(incidentId);
    expect(result.manifest.fault).toBe(FAULT_SLUG);
    expect(result.manifest.rootService).toBe("payment-service");
    expect(result.manifest.affectedServices).toEqual(["payment-service"]);
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

  it("has queue_depth growing (non-decreasing) on payment-service", () => {
    const series = result.metricEvents
      .filter((m) => m.service === "payment-service" && m.metric === "queue_depth")
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    expect(series.length).toBeGreaterThan(5);
    for (let i = 1; i < series.length; i++) {
      expect(series[i]!.value).toBeGreaterThanOrEqual(series[i - 1]!.value);
    }
    expect(series[series.length - 1]!.value).toBeGreaterThan(series[0]!.value * 5);
  });

  it("has processing_delay_ms growing (non-decreasing) on payment-service", () => {
    const series = result.metricEvents
      .filter((m) => m.service === "payment-service" && m.metric === "processing_delay_ms")
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    for (let i = 1; i < series.length; i++) {
      expect(series[i]!.value).toBeGreaterThanOrEqual(series[i - 1]!.value);
    }
  });
});
