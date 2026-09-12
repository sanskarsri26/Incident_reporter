import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ENV_KEYS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;
const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.resetModules();
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

describe("register", () => {
  it("does not throw with no Supabase env vars set", async () => {
    const { register } = await import("../instrumentation");
    expect(() => register()).not.toThrow();
  });

  it("throws when a real database is configured without real auth", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    const { register } = await import("../instrumentation");
    expect(() => register()).toThrow(/mock auth provider/i);
  });
});
