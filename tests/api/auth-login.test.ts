import { describe, it, expect, beforeEach } from "vitest";
import { resetMockAuthProviderForTests } from "@/lib/auth/mock-auth-provider";
import { resetRateLimiterForTests } from "@/lib/security/rate-limit";
import { POST as postSignup } from "@/app/api/auth/signup/route";
import { POST as postLogin } from "@/app/api/auth/login/route";

function request(path: string, body: unknown, ip = "203.0.113.5"): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    resetMockAuthProviderForTests();
    resetRateLimiterForTests();
  });

  it("logs in with the correct password", async () => {
    await postSignup(request("/api/auth/signup", { email: "a@example.com", password: "password123" }));
    const response = await postLogin(request("/api/auth/login", { email: "a@example.com", password: "password123" }, "203.0.113.6"));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("mock-session");
  });

  it("rejects the wrong password with 401", async () => {
    await postSignup(request("/api/auth/signup", { email: "a@example.com", password: "password123" }));
    const response = await postLogin(request("/api/auth/login", { email: "a@example.com", password: "wrong" }, "203.0.113.6"));
    expect(response.status).toBe(401);
  });

  it("returns 429 once the rate limit is exceeded", async () => {
    let lastResponse: Response | undefined;
    for (let i = 0; i < 25; i += 1) {
      lastResponse = await postLogin(request("/api/auth/login", { email: "a@example.com", password: "x" }));
    }
    expect(lastResponse?.status).toBe(429);
  });
});
