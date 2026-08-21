import { describe, it, expect } from "vitest";
import { injectBadConfigDeploy, FAULT_SLUG } from "@/simulator/fault-injection/bad-config-deploy";

describe("injectBadConfigDeploy", () => {
  const incidentId = "INC-TEST-0008";
  const startedAt = new Date("2026-03-01T10:00:00.000Z");
  const result = injectBadConfigDeploy(incidentId, startedAt);

  it("reports correct manifest fields", () => {
    expect(result.manifest.incidentId).toBe(incidentId);
    expect(result.manifest.fault).toBe(FAULT_SLUG);
    expect(result.manifest.rootService).toBe("checkout-service");
    expect(result.manifest.affectedServices).toEqual(["checkout-service", "payment-service"]);
    expect(result.manifest.validActions.length).toBeGreaterThanOrEqual(2);
  });

  it("scopes every event to the given incident id", () => {
    for (const e of [...result.logEvents, ...result.metricEvents]) {
      expect(e.incidentId).toBe(incidentId);
    }
  });

  it("produces enough log and metric events", () => {
    expect(result.logEvents.length).toBeGreaterThanOrEqual(6);
    expect(result.metricEvents.length).toBeGreaterThanOrEqual(15);
  });

  it("has a config_deployed log event", () => {
    const deployLog = result.logEvents.find((l) => l.template === "config_deployed");
    expect(deployLog).toBeDefined();
    expect(deployLog?.service).toBe("checkout-service");
  });

  it("errors jump abruptly right after config_deployed rather than ramping gradually", () => {
    const deployLog = result.logEvents.find((l) => l.template === "config_deployed")!;
    const series = result.metricEvents
      .filter((m) => m.service === "checkout-service" && m.metric === "error_rate")
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    const before = series.filter((m) => m.timestamp < deployLog.timestamp);
    const after = series.filter((m) => m.timestamp >= deployLog.timestamp);
    expect(before.length).toBeGreaterThan(0);
    expect(after.length).toBeGreaterThan(0);

    const maxBefore = Math.max(...before.map((m) => m.value));
    const minAfter = Math.min(...after.map((m) => m.value));

    // Step change: the lowest post-deploy value is already far above the
    // highest pre-deploy value (no gradual ramp through the gap).
    expect(minAfter).toBeGreaterThan(maxBefore * 5);

    // Not a gradual ramp: variance of the "after" segment stays low relative
    // to the jump size — first and last of `after` are close to each other.
    const afterFirst = after[0]!.value;
    const afterLast = after[after.length - 1]!.value;
    expect(Math.abs(afterLast - afterFirst)).toBeLessThan(minAfter);
  });

  it("has error logs referencing the invalid config on checkout-service and payment-service", () => {
    expect(result.logEvents.some((l) => l.service === "checkout-service" && l.level === "error")).toBe(true);
    expect(result.logEvents.some((l) => l.service === "payment-service" && l.level === "error")).toBe(true);
  });
});
