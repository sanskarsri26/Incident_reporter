import { describe, it, expect } from "vitest";
import type { Incident, Severity } from "@/lib/types";
import { SEVERITIES } from "@/lib/types";

describe("domain types", () => {
  it("SEVERITIES lists all Severity values in priority order", () => {
    expect(SEVERITIES).toEqual(["sev1", "sev2", "sev3", "sev4"]);
  });

  it("an Incident object satisfies the Incident type", () => {
    const incident: Incident = {
      id: "INC-0001",
      title: "DB connection pool exhaustion",
      severity: "sev1" as Severity,
      status: "resolved",
      startedAt: "2026-01-01T00:00:00.000Z",
      resolvedAt: "2026-01-01T00:30:00.000Z",
      rootCauseTruth: "db_connection_pool_exhaustion",
      affectedServices: ["payment-service", "checkout-service"],
      ownerId: null,
    };
    expect(incident.id).toBe("INC-0001");
  });
});
