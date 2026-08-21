import { describe, it, expect, beforeEach } from "vitest";
import { resetRepositoryForTests, getRepository } from "@/lib/db/index";
import { resetRateLimiterForTests } from "@/lib/security/rate-limit";
import { POST as postFeedback } from "@/app/api/feedback/route";

function request(body: unknown, ip = "203.0.113.5"): Request {
  return new Request("http://localhost/api/feedback", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

describe("POST /api/feedback", () => {
  beforeEach(() => {
    resetRepositoryForTests();
    resetRateLimiterForTests();
  });

  it("saves valid feedback and returns 201", async () => {
    const response = await postFeedback(request({ incidentId: "INC-1", message: "Great demo", rating: 5 }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.feedback.message).toBe("Great demo");

    const saved = await getRepository().listFeedback();
    expect(saved).toHaveLength(1);
  });

  it("allows feedback with no incident id or rating", async () => {
    const response = await postFeedback(request({ message: "General feedback" }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.feedback.incidentId).toBeNull();
    expect(body.feedback.rating).toBeNull();
  });

  it("rejects an empty message", async () => {
    const response = await postFeedback(request({ message: "" }));
    expect(response.status).toBe(400);
  });

  it("rejects a rating outside 1-5", async () => {
    const response = await postFeedback(request({ message: "x", rating: 10 }));
    expect(response.status).toBe(400);
  });

  it("rejects invalid JSON", async () => {
    const response = await postFeedback(new Request("http://localhost/api/feedback", { method: "POST", body: "{not json" }));
    expect(response.status).toBe(400);
  });

  it("rejects an oversized body", async () => {
    const response = await postFeedback(request({ message: "x".repeat(5000) }));
    expect(response.status).toBe(413);
  });

  it("returns 429 once the rate limit is exceeded, and does not share a bucket with the investigate route", async () => {
    let lastResponse: Response | undefined;
    for (let i = 0; i < 25; i += 1) {
      lastResponse = await postFeedback(request({ message: "spam" }, "203.0.113.9"));
    }
    expect(lastResponse?.status).toBe(429);
  });
});
