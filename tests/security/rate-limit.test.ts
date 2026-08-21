import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  consumeRateLimit,
  createInMemoryRateLimiter,
  createUpstashRateLimiter,
  getRateLimiter,
  resetRateLimiterForTests,
  type RateLimiter,
} from "@/lib/security/rate-limit";

describe("createInMemoryRateLimiter", () => {
  it("allows requests up to capacity, then denies", async () => {
    let currentMs = 0;
    const limiter = createInMemoryRateLimiter({ capacity: 2, refillPerSecond: 0, now: () => currentMs });

    expect((await limiter.consume("user-1")).allowed).toBe(true);
    expect((await limiter.consume("user-1")).allowed).toBe(true);
    expect((await limiter.consume("user-1")).allowed).toBe(false);
  });

  it("refills tokens over time", async () => {
    let currentMs = 0;
    const limiter = createInMemoryRateLimiter({ capacity: 1, refillPerSecond: 1, now: () => currentMs });

    expect((await limiter.consume("user-1")).allowed).toBe(true);
    expect((await limiter.consume("user-1")).allowed).toBe(false);

    currentMs += 1000;
    expect((await limiter.consume("user-1")).allowed).toBe(true);
  });

  it("tracks separate buckets per key", async () => {
    const limiter = createInMemoryRateLimiter({ capacity: 1, refillPerSecond: 0 });
    expect((await limiter.consume("user-a")).allowed).toBe(true);
    expect((await limiter.consume("user-b")).allowed).toBe(true);
    expect((await limiter.consume("user-a")).allowed).toBe(false);
  });

  it("bounds memory by evicting old buckets once maxBuckets is exceeded", async () => {
    const limiter = createInMemoryRateLimiter({ capacity: 5, refillPerSecond: 0, maxBuckets: 3 });
    // A flood of distinct (e.g. attacker-spoofed) keys must not grow the
    // underlying Map without bound.
    for (let i = 0; i < 100; i += 1) {
      await limiter.consume(`flood-key-${i}`);
    }
    // The very first key should have been evicted long ago, so it gets a
    // fresh full bucket again rather than continuing a prior count.
    const result = await limiter.consume("flood-key-0");
    expect(result.remaining).toBe(4);
  });
});

describe("createUpstashRateLimiter", () => {
  it("allows when the incremented count is within the limit", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => [{ result: 3 }, { result: 1 }] });
    const limiter = createUpstashRateLimiter({ url: "https://example.upstash.io", token: "t", limit: 5, windowSeconds: 60, fetchImpl });

    const result = await limiter.consume("user-1");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it("denies once the count exceeds the limit", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => [{ result: 10 }, { result: 1 }] });
    const limiter = createUpstashRateLimiter({ url: "https://example.upstash.io", token: "t", limit: 5, windowSeconds: 60, fetchImpl });

    const result = await limiter.consume("user-1");
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("throws when the Upstash request fails", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "boom" });
    const limiter = createUpstashRateLimiter({ url: "https://example.upstash.io", token: "t", limit: 5, windowSeconds: 60, fetchImpl });

    await expect(limiter.consume("user-1")).rejects.toThrow(/500/);
  });
});

describe("consumeRateLimit", () => {
  it("returns the limiter's real result when it does not throw", async () => {
    const limiter = createInMemoryRateLimiter({ capacity: 1, refillPerSecond: 0 });
    const result = await consumeRateLimit(limiter, "user-1");
    expect(result.allowed).toBe(true);
  });

  it("fails open (allows the request) when the limiter throws, e.g. an Upstash outage", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const throwingLimiter: RateLimiter = {
      consume: async () => {
        throw new Error("Upstash unreachable");
      },
    };

    const result = await consumeRateLimit(throwingLimiter, "user-1");
    expect(result.allowed).toBe(true);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe("getRateLimiter", () => {
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  beforeEach(() => {
    resetRateLimiterForTests();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  afterEach(() => {
    if (originalUrl) process.env.UPSTASH_REDIS_REST_URL = originalUrl;
    if (originalToken) process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
    resetRateLimiterForTests();
  });

  it("defaults to an in-memory limiter with no Upstash env vars configured", async () => {
    const limiter = getRateLimiter();
    const result = await limiter.consume("user-1");
    expect(result.allowed).toBe(true);
  });

  it("caches the limiter instance across calls", () => {
    expect(getRateLimiter()).toBe(getRateLimiter());
  });
});
