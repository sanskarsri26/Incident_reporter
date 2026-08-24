import { describe, it, expect, beforeEach } from "vitest";
import { createMockAuthProvider, resetMockAuthProviderForTests } from "@/lib/auth/mock-auth-provider";
import { createMemoryCookieAdapter } from "./memory-cookie-adapter";

beforeEach(() => {
  resetMockAuthProviderForTests();
});

describe("mock auth provider", () => {
  it("signUp creates a user and sets a session cookie", async () => {
    const cookies = createMemoryCookieAdapter();
    const provider = createMockAuthProvider(cookies.adapter);

    const result = await provider.signUp("a@example.com", "password123");

    expect(result.error).toBeNull();
    expect(result.user?.email).toBe("a@example.com");
    expect(cookies.setCookies.some((c) => c.name === "mock-session")).toBe(true);
  });

  it("signUp rejects a duplicate email", async () => {
    const cookies = createMemoryCookieAdapter();
    await createMockAuthProvider(cookies.adapter).signUp("a@example.com", "password123");

    const second = createMockAuthProvider(createMemoryCookieAdapter().adapter);
    const result = await second.signUp("a@example.com", "different");
    expect(result.error).toBe("An account with this email already exists.");
    expect(result.user).toBeNull();
  });

  it("signInWithPassword succeeds with the correct password and fails with the wrong one", async () => {
    const signupCookies = createMemoryCookieAdapter();
    await createMockAuthProvider(signupCookies.adapter).signUp("a@example.com", "password123");

    const loginCookies = createMemoryCookieAdapter();
    const ok = await createMockAuthProvider(loginCookies.adapter).signInWithPassword("a@example.com", "password123");
    expect(ok.error).toBeNull();
    expect(ok.user?.email).toBe("a@example.com");

    const badCookies = createMemoryCookieAdapter();
    const bad = await createMockAuthProvider(badCookies.adapter).signInWithPassword("a@example.com", "wrong");
    expect(bad.error).toBe("Invalid login credentials");
    expect(bad.user).toBeNull();
  });

  it("getUser reads the session cookie set by signUp/signIn", async () => {
    const cookies = createMemoryCookieAdapter();
    const provider = createMockAuthProvider(cookies.adapter);
    await provider.signUp("a@example.com", "password123");

    // A second provider instance sharing the same cookie jar (simulating a
    // later request) should read the same session back.
    const laterCookies = createMemoryCookieAdapter();
    laterCookies.setCookies.push(...cookies.setCookies);
    laterCookies.adapter.getAll = () => laterCookies.setCookies.map((c) => ({ name: c.name, value: c.value }));
    const later = createMockAuthProvider(laterCookies.adapter);

    const user = await later.getUser();
    expect(user?.email).toBe("a@example.com");
  });

  it("getUser returns null when there is no session cookie", async () => {
    const cookies = createMemoryCookieAdapter();
    expect(await createMockAuthProvider(cookies.adapter).getUser()).toBeNull();
  });

  it("signOut clears the session cookie", async () => {
    const cookies = createMemoryCookieAdapter();
    const provider = createMockAuthProvider(cookies.adapter);
    await provider.signUp("a@example.com", "password123");
    await provider.signOut();

    const last = cookies.setCookies.at(-1);
    expect(last?.name).toBe("mock-session");
    expect(last?.options?.maxAge).toBe(0);
  });
});
