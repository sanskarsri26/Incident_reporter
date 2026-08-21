import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getRepository, resetRepositoryForTests } from "@/lib/db/index";

describe("getRepository", () => {
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    resetRepositoryForTests();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterEach(() => {
    if (originalUrl) process.env.SUPABASE_URL = originalUrl;
    if (originalKey) process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    resetRepositoryForTests();
  });

  it("defaults to an in-memory repository with no Supabase env vars", async () => {
    const repo = getRepository();
    expect(await repo.listIncidents()).toEqual([]);
  });

  it("returns the same cached instance on repeated calls", () => {
    expect(getRepository()).toBe(getRepository());
  });
});
