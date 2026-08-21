import { describe, it, expect } from "vitest";
import { GET as getEvaluationSummary } from "@/app/api/evaluation/summary/route";

describe("GET /api/evaluation/summary", () => {
  it("returns the committed evaluation report", async () => {
    const response = await getEvaluationSummary();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.available).toBe(true);
    expect(body.report.primary.caseCount).toBeGreaterThan(0);
  });
});
