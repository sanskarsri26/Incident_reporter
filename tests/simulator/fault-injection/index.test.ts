import { describe, it, expect } from "vitest";
import { FAULT_REGISTRY, FAULT_SLUGS } from "@/simulator/fault-injection/index";

const EXPECTED_SLUGS = [
  "db_connection_pool_exhaustion",
  "db_slow_query",
  "memory_leak",
  "dependency_timeout",
  "cpu_spike",
  "redis_unavailable",
  "worker_backlog",
  "bad_config_deploy",
];

describe("FAULT_REGISTRY", () => {
  it("has an entry for all 8 fault slugs from the plan", () => {
    expect(FAULT_SLUGS.sort()).toEqual([...EXPECTED_SLUGS].sort());
  });

  it("every registered injector is callable and returns a matching manifest.fault", () => {
    const incidentId = "INC-REGISTRY-TEST";
    const startedAt = new Date("2026-03-01T00:00:00.000Z");
    for (const [slug, inject] of Object.entries(FAULT_REGISTRY)) {
      const result = inject(incidentId, startedAt);
      expect(result.manifest.fault).toBe(slug);
      expect(result.logEvents.length).toBeGreaterThan(0);
      expect(result.metricEvents.length).toBeGreaterThan(0);
    }
  });
});
