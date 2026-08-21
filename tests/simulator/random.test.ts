import { describe, it, expect } from "vitest";
import { mulberry32, hashStringToSeed, seededRng } from "@/simulator/random";

describe("mulberry32", () => {
  it("produces the same sequence for the same seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it("produces different sequences for different seeds", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
  });

  it("produces values within [0, 1)", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("hashStringToSeed", () => {
  it("is deterministic for the same input", () => {
    expect(hashStringToSeed("INC-0001")).toBe(hashStringToSeed("INC-0001"));
  });

  it("differs for different inputs", () => {
    expect(hashStringToSeed("INC-0001")).not.toBe(hashStringToSeed("INC-0002"));
  });
});

describe("seededRng", () => {
  it("is deterministic for the same incidentId + salt", () => {
    const a = seededRng("INC-0001", "metrics");
    const b = seededRng("INC-0001", "metrics");
    expect(a()).toBe(b());
  });

  it("differs across salts for the same incident", () => {
    const a = seededRng("INC-0001", "metrics")();
    const b = seededRng("INC-0001", "logs")();
    expect(a).not.toBe(b);
  });
});
