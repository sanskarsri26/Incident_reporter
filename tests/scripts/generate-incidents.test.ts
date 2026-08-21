import { describe, it, expect } from "vitest";
import { generateOneIncident } from "../../scripts/generate-incidents";
import { FAULT_SLUGS } from "@/simulator/fault-injection/index";
import { INCIDENT_STATUSES } from "@/lib/types";

describe("generateOneIncident", () => {
  it("builds a consistent incident + manifest + events bundle for every fault type", () => {
    for (const fault of FAULT_SLUGS) {
      const incidentId = `INC-UNIT-${fault}`;
      const generated = generateOneIncident(fault, incidentId);

      expect(generated.incident.id).toBe(incidentId);
      expect(generated.incident.rootCauseTruth).toBe(fault);
      expect(INCIDENT_STATUSES).toContain(generated.incident.status);
      if (generated.incident.status === "resolved") {
        expect(generated.incident.resolvedAt).not.toBeNull();
        expect(new Date(generated.incident.resolvedAt!).getTime()).toBeGreaterThan(
          new Date(generated.incident.startedAt).getTime(),
        );
      } else {
        expect(generated.incident.resolvedAt).toBeNull();
      }
      // The title must never be a direct restatement of the fault slug --
      // that's exactly the label leak this dataset must avoid.
      expect(generated.incident.title.toLowerCase()).not.toContain(fault.replace(/_/g, " "));
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

  it("does not use a fixed 1:1 title or severity per fault type (no label leakage)", () => {
    const titles = new Set<string>();
    const severities = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const generated = generateOneIncident("db_connection_pool_exhaustion", `INC-UNIT-LEAK-${i}`);
      titles.add(generated.incident.title);
      severities.add(generated.incident.severity);
    }
    expect(titles.size).toBeGreaterThan(1);
    expect(severities.size).toBeGreaterThan(1);
  });
});
