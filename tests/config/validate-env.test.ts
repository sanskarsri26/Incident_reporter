import { describe, it, expect } from "vitest";
import { validateAuthDbConfig } from "@/lib/config/validate-env";

describe("validateAuthDbConfig", () => {
  it("does not throw when every Supabase env var is unset (fully in-memory/mock demo mode)", () => {
    expect(() => validateAuthDbConfig({})).not.toThrow();
  });

  it("does not throw when a real database and real auth are both fully configured", () => {
    expect(() =>
      validateAuthDbConfig({
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
        NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      }),
    ).not.toThrow();
  });

  it("does not throw when only real auth is configured against the in-memory database", () => {
    expect(() =>
      validateAuthDbConfig({
        NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      }),
    ).not.toThrow();
  });

  it("throws when a real database is configured but real auth is not (mock auth against real data)", () => {
    expect(() =>
      validateAuthDbConfig({
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      }),
    ).toThrow(/mock auth provider/i);
  });

  it("throws when only NEXT_PUBLIC_SUPABASE_URL is set for auth but not the anon key, against a real database", () => {
    expect(() =>
      validateAuthDbConfig({
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
        NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      }),
    ).toThrow(/mock auth provider/i);
  });

  it("throws when only SUPABASE_URL is set for the database but not the service role key, with auth also unconfigured", () => {
    // Partial DB config falls back to the in-memory repository (see
    // lib/db/index.ts's `url && key` check) -- not the unsafe combination --
    // so this must NOT throw.
    expect(() =>
      validateAuthDbConfig({
        SUPABASE_URL: "https://project.supabase.co",
      }),
    ).not.toThrow();
  });
});
