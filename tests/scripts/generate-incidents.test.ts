import { describe, it, expect } from "vitest";
import { generateOneIncident } from "../../scripts/generate-incidents";
import { FAULT_SLUGS } from "@/simulator/fault-injection/index";

describe("generateOneIncident", () => {
  it("builds a consistent incident + manifest + events bundle for every fault type", () => {
    for (const fault of FAULT_SLUGS) {
      const incidentId = `INC-UNIT-${fault}`;
      const generated = generateOneIncident(fault, incidentId);

      expect(generated.incident.id).toBe(incidentId);
      expect(generated.incident.rootCauseTruth).toBe(fault);
      expect(generated.incident.status).toBe("resolved");
      expect(generated.incident.resolvedAt).not.toBeNull();
      expect(new Date(generated.incident.resolvedAt!).getTime()).toBeGreaterThan(
        new Date(generated.incident.startedAt).getTime(),
      );
      expect(generated.incident.affectedServices).toEqual(generated.manifest.affectedServices);
      expect(generated.manifest.fault).toBe(fault);

      for (const e of [...generated.logEvents, ...generated.metricEvents]) {
        expect(e.incidentId).toBe(incidentId);
      }

      // Merged baseline + fault signal should be a healthy amount of data.
      expect(generated.logEvents.length).toBeGreaterThan(10);
      expect(generated.metricEvents.length).toBeGreaterThan(20);

      // Events should be sorted by timestamp.
      const timestamps = [...generated.logEvents, ...generated.metricEvents].map((e) => e.timestamp);
      // (not globally sorted since logs/metrics are separate arrays, but each array itself is sorted)
      const logTimestamps = generated.logEvents.map((e) => e.timestamp);
      const sortedLogTimestamps = [...logTimestamps].sort();
      expect(logTimestamps).toEqual(sortedLogTimestamps);
      const metricTimestamps = generated.metricEvents.map((e) => e.timestamp);
      const sortedMetricTimestamps = [...metricTimestamps].sort();
      expect(metricTimestamps).toEqual(sortedMetricTimestamps);
      expect(timestamps.length).toBeGreaterThan(0);
    }
  });

  it("is deterministic for the same fault + incident id", () => {
    const a = generateOneIncident("memory_leak", "INC-UNIT-DETERMINISM");
    const b = generateOneIncident("memory_leak", "INC-UNIT-DETERMINISM");
    expect(a.incident.startedAt).toBe(b.incident.startedAt);
    expect(a.incident.resolvedAt).toBe(b.incident.resolvedAt);
    expect(a.metricEvents.map((m) => m.value)).toEqual(b.metricEvents.map((m) => m.value));
  });

  it("varies start times across different incident ids for the same fault", () => {
    const a = generateOneIncident("cpu_spike", "INC-UNIT-A");
    const b = generateOneIncident("cpu_spike", "INC-UNIT-B");
    expect(a.incident.startedAt).not.toBe(b.incident.startedAt);
  });
});
