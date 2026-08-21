import { describe, it, expect } from "vitest";
import { createMemoryRepository } from "@/lib/db/memory-repository";
import type { Feedback } from "@/lib/types";

describe("Repository feedback methods", () => {
  it("saves and lists feedback entries", async () => {
    const repo = createMemoryRepository();
    const feedback: Feedback = { id: "F1", incidentId: "INC-1", message: "Great demo!", rating: 5, createdAt: "2026-01-01T00:00:00.000Z" };
    await repo.saveFeedback(feedback);
    expect(await repo.listFeedback()).toEqual([feedback]);
  });

  it("returns an empty list when no feedback has been saved", async () => {
    const repo = createMemoryRepository();
    expect(await repo.listFeedback()).toEqual([]);
  });

  it("supports feedback with no associated incident", async () => {
    const repo = createMemoryRepository();
    const feedback: Feedback = { id: "F1", incidentId: null, message: "General feedback", rating: null, createdAt: "2026-01-01T00:00:00.000Z" };
    await repo.saveFeedback(feedback);
    const [saved] = await repo.listFeedback();
    expect(saved?.incidentId).toBeNull();
  });
});
