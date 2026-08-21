import { describe, it, expect } from "vitest";
import { createStratifiedSplit } from "@/lib/evaluation/split";

function incidents(fault: string, count: number, offset = 0): Array<{ id: string; fault: string }> {
  return Array.from({ length: count }, (_, i) => ({ id: `${fault}-${i + offset}`, fault }));
}

describe("createStratifiedSplit", () => {
  it("assigns every incident to exactly one split", () => {
    const all = [...incidents("a", 7), ...incidents("b", 7)];
    const assignments = createStratifiedSplit(all);
    expect(assignments).toHaveLength(14);
    expect(new Set(assignments.map((a) => a.incidentId)).size).toBe(14);
  });

  it("splits roughly 60/20/20 within each fault type, not just overall", () => {
    const all = incidents("a", 10);
    const assignments = createStratifiedSplit(all);
    const counts = { dev: 0, validation: 0, test: 0 };
    for (const a of assignments) counts[a.split] += 1;
    expect(counts.dev).toBe(6);
    expect(counts.validation).toBe(2);
    expect(counts.test).toBe(2);
  });

  it("is deterministic for the same input and seed", () => {
    const all = [...incidents("a", 7), ...incidents("b", 7)];
    const first = createStratifiedSplit(all, { seed: 1 });
    const second = createStratifiedSplit(all, { seed: 1 });
    expect(second).toEqual(first);
  });

  it("produces a different assignment for a different seed", () => {
    const all = incidents("a", 20);
    const first = createStratifiedSplit(all, { seed: 1 });
    const second = createStratifiedSplit(all, { seed: 2 });
    expect(second).not.toEqual(first);
  });

  it("keeps every fault type represented in the dev split when there are enough incidents", () => {
    const all = [...incidents("a", 5), ...incidents("b", 5), ...incidents("c", 5)];
    const assignments = createStratifiedSplit(all);
    const devFaults = new Set(
      assignments.filter((a) => a.split === "dev").map((a) => a.incidentId.split("-")[0]),
    );
    expect(devFaults).toEqual(new Set(["a", "b", "c"]));
  });
});
