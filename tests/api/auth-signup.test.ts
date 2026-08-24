import { describe, it, expect, beforeEach } from "vitest";
import { resetMockAuthProviderForTests } from "@/lib/auth/mock-auth-provider";
import { resetRateLimiterForTests } from "@/lib/security/rate-limit";
import { POST as postSignup } from "@/app/api/auth/signup/route";

function request(body: unknown, ip = "203.0.113.5"): Request {
  return new Request("http://localhost/api/auth/signup", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/signup", () => {
  beforeEach(() => {
    resetMockAuthProviderForTests();
    resetRateLimiterForTests();
  });

  it("creates an account and sets a session cookie", async () => {
    const response = await postSignup(request({ email: "a@example.com", password: "password123" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("mock-session");
  });

  it("rejects an invalid email", async () => {
    const response = await postSignup(request({ email: "not-an-email", password: "password123" }));
    expect(response.status).toBe(400);
  });

  it("rejects a duplicate signup", async () => {
    await postSignup(request({ email: "a@example.com", password: "password123" }));
    const response = await postSignup(request({ email: "a@example.com", password: "password123" }, "203.0.113.6"));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("An account with this email already exists.");
  });

  it("rejects invalid JSON", async () => {
    const response = await postSignup(
      new Request("http://localhost/api/auth/signup", { method: "POST", body: "{not json" }),
    );
    expect(response.status).toBe(400);
  });
});
