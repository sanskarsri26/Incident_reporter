import { describe, it, expect } from "vitest";
import { GET as getHealth } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("returns ok status with a timestamp, no repository/provider dependency", async () => {
    const response = await getHealth();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });
});
