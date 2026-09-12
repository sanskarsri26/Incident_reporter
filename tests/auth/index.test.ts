import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { CookieAdapter } from "@/lib/auth/cookie-adapter";

const noopCookies: CookieAdapter = {
  getAll: () => [],
  setAll: () => {},
};

const ENV_KEYS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;
const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
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

describe("getAuthProvider", () => {
  it("returns the mock provider when nothing is configured", async () => {
    const { getAuthProvider } = await import("@/lib/auth/index");
    const provider = getAuthProvider(noopCookies);
    expect(provider.name).toBe("mock");
  });

  it("returns the supabase provider when real auth is fully configured", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    const { getAuthProvider } = await import("@/lib/auth/index");
    const provider = getAuthProvider(noopCookies);
    expect(provider.name).toBe("supabase");
  });

  it("throws instead of falling back to mock auth when a real database is configured without real auth", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    const { getAuthProvider } = await import("@/lib/auth/index");
    expect(() => getAuthProvider(noopCookies)).toThrow(/mock auth provider/i);
  });
});
