import { describe, it, expect } from "vitest";
import { SERVICES, SERVICE_DEPENDENCIES, SERVICE_IDS } from "@/simulator/services/graph";

describe("service graph", () => {
  it("defines exactly the six modeled services", () => {
    expect(SERVICE_IDS.sort()).toEqual(
      ["checkout-service", "gateway", "inventory-service", "payment-service", "postgres", "redis"].sort(),
    );
  });

  it("every dependency references a known service on both ends", () => {
    for (const dep of SERVICE_DEPENDENCIES) {
      expect(SERVICE_IDS).toContain(dep.sourceService);
      expect(SERVICE_IDS).toContain(dep.targetService);
    }
  });

  it("models the checkout path: gateway -> checkout-service -> payment-service -> postgres", () => {
    expect(SERVICE_DEPENDENCIES).toContainEqual({ sourceService: "gateway", targetService: "checkout-service" });
    expect(SERVICE_DEPENDENCIES).toContainEqual({ sourceService: "checkout-service", targetService: "payment-service" });
    expect(SERVICE_DEPENDENCIES).toContainEqual({ sourceService: "payment-service", targetService: "postgres" });
  });

  it("models the inventory path: gateway -> inventory-service -> redis", () => {
    expect(SERVICE_DEPENDENCIES).toContainEqual({ sourceService: "gateway", targetService: "inventory-service" });
    expect(SERVICE_DEPENDENCIES).toContainEqual({ sourceService: "inventory-service", targetService: "redis" });
  });

  it("gives every service a stable id/name/type shape", () => {
    for (const service of SERVICES) {
      expect(service.id).toBeTruthy();
      expect(service.name).toBeTruthy();
      expect(service.type).toBeTruthy();
    }
  });
});
