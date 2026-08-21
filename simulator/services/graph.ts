import type { Service, ServiceDependency } from "@/lib/types";

/**
 * The small simulated system from the plan:
 *
 *   client -> gateway -> checkout-service -> payment-service -> postgres
 *                     \-> inventory-service -> redis
 *
 * `client` is external traffic, not a modeled service/dependency node.
 */
export const SERVICES: Service[] = [
  { id: "gateway", name: "gateway", type: "api_gateway" },
  { id: "checkout-service", name: "checkout-service", type: "application" },
  { id: "payment-service", name: "payment-service", type: "application" },
  { id: "inventory-service", name: "inventory-service", type: "application" },
  { id: "postgres", name: "postgres", type: "database" },
  { id: "redis", name: "redis", type: "cache" },
];

export const SERVICE_DEPENDENCIES: ServiceDependency[] = [
  { sourceService: "gateway", targetService: "checkout-service" },
  { sourceService: "checkout-service", targetService: "payment-service" },
  { sourceService: "payment-service", targetService: "postgres" },
  { sourceService: "gateway", targetService: "inventory-service" },
  { sourceService: "inventory-service", targetService: "redis" },
];

export const SERVICE_IDS: string[] = SERVICES.map((s) => s.id);
