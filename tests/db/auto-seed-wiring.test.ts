import { describe, it, expect, afterEach } from "vitest";
import { getRepository, resetRepositoryForTests } from "@/lib/db/index";

// getRepository() only auto-seeds outside of Vitest (process.env.VITEST is
// unset), since tests want a clean, explicitly-seeded repository per test.
// This test simulates "not running under Vitest" to exercise that path.
describe("getRepository auto-seed (simulating a real app process)", () => {
  const originalVitestFlag = process.env.VITEST;

  afterEach(() => {
    if (originalVitestFlag !== undefined) process.env.VITEST = originalVitestFlag;
    resetRepositoryForTests();
  });

  it("auto-populates the in-memory repository with the full demo dataset once VITEST is unset", async () => {
    resetRepositoryForTests();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.VITEST;

    const repository = getRepository();

    const incidents = await repository.listIncidents();
    expect(incidents.length).toBeGreaterThanOrEqual(56);

    const services = await repository.listServices();
    expect(services.length).toBe(6);

    const documents = await repository.listDocuments();
    expect(documents.length).toBe(11);
    expect(documents.every((d) => d.embedding !== null)).toBe(true);

    const logs = await repository.listLogEvents(incidents[0]!.id);
    expect(logs.length).toBeGreaterThan(0);
  });

  it("does not auto-seed while VITEST is set (the normal test path stays isolated)", async () => {
    resetRepositoryForTests();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.VITEST = "true";

    const repository = getRepository();
    expect(await repository.listIncidents()).toEqual([]);
  });
});
