import { describe, it, expect, beforeEach } from "vitest";
import { resetMockAuthProviderForTests } from "@/lib/auth/mock-auth-provider";
import { resetRateLimiterForTests } from "@/lib/security/rate-limit";
import { POST as postLogout } from "@/app/api/auth/logout/route";

describe("POST /api/auth/logout", () => {
  beforeEach(() => {
    resetMockAuthProviderForTests();
    resetRateLimiterForTests();
  });

  it("clears the session cookie", async () => {
    const response = await postLogout(new Request("http://localhost/api/auth/logout", { method: "POST" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
