import { describe, it, expect } from "vitest";
import { evidenceTagMatches } from "@/lib/evaluation/evidence-tags";

describe("evidenceTagMatches", () => {
  it("matches a tag against a summary containing most of its significant keywords", () => {
    expect(evidenceTagMatches("db_pool_at_limit", "postgres: active connections at pool limit")).toBe(true);
    expect(evidenceTagMatches("connection_timeout", "payment-service: connection timeout waiting for pool")).toBe(true);
    expect(evidenceTagMatches("worker_retry", "payment-service: worker retrying after connection timeout")).toBe(true);
  });

  it("does not match an unrelated summary", () => {
    expect(evidenceTagMatches("db_pool_at_limit", "inventory-service: cpu saturation detected")).toBe(false);
  });

  it("ignores short/insignificant words like 'at'", () => {
    expect(evidenceTagMatches("db_pool_at_limit", "the pool limit was reached")).toBe(true);
  });

  it("returns false for a tag with no significant keywords", () => {
    expect(evidenceTagMatches("at_in_on", "any text here")).toBe(false);
  });

  it("requires every significant keyword, not just a majority -- a single generic word must not carry the match alone", () => {
    // "db_pool_at_limit" has two significant keywords: "pool" and "limit".
    // A summary that mentions an unrelated pool (e.g. a thread pool on a
    // different service) but never "limit" must not count as a match.
    expect(evidenceTagMatches("db_pool_at_limit", "worker-service: thread pool resized")).toBe(false);
  });
});
