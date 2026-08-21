import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { seedServices, seedIncidents, seedRunbooks } from "../../scripts/seed";
import { getRepository, resetRepositoryForTests } from "@/lib/db/index";

describe("seed script (in-memory repository)", () => {
  beforeEach(() => {
    resetRepositoryForTests();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterEach(() => {
    resetRepositoryForTests();
  });

  it("seeds the service topology into the repository", async () => {
    const summary = await seedServices();
    expect(summary.services).toBe(6);
    expect(summary.dependencies).toBe(5);

    const repo = getRepository();
    const services = await repo.listServices();
    const deps = await repo.listServiceDependencies();
    expect(services.map((s) => s.id).sort()).toEqual(
      ["checkout-service", "gateway", "inventory-service", "payment-service", "postgres", "redis"].sort(),
    );
    expect(deps.length).toBe(5);
  });

  it("seeds generated incidents (with log/metric events) from data/incident-manifests", async () => {
    const summary = await seedIncidents();
    expect(summary.incidents).toBeGreaterThanOrEqual(56);
    expect(summary.logEvents).toBeGreaterThan(0);
    expect(summary.metricEvents).toBeGreaterThan(0);

    const repo = getRepository();
    const incidents = await repo.listIncidents();
    expect(incidents.length).toBe(summary.incidents);

    const first = incidents[0]!;
    const logs = await repo.listLogEvents(first.id);
    expect(logs.length).toBeGreaterThan(0);
  });

  it("seeds runbooks and service descriptions from data/runbooks as documents", async () => {
    const summary = await seedRunbooks();
    expect(summary.runbooks).toBe(8);
    expect(summary.serviceDescriptions).toBe(3);

    const repo = getRepository();
    const documents = await repo.listDocuments();
    expect(documents.length).toBe(11);
    for (const doc of documents) {
      expect(doc.embedding).toBeNull();
      expect(doc.body.length).toBeGreaterThan(0);
      expect(["runbook", "service_description"]).toContain(doc.docType);
    }

    const dbDoc = documents.find((d) => d.id === "db_connection_pool_exhaustion");
    expect(dbDoc?.docType).toBe("runbook");
    const svcDoc = documents.find((d) => d.id === "service-postgres");
    expect(svcDoc?.docType).toBe("service_description");
  });
});
