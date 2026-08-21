export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

export interface RateLimiter {
  consume(key: string): Promise<RateLimitResult>;
}

export interface InMemoryRateLimiterOptions {
  capacity: number;
  refillPerSecond: number;
  now?: () => number;
  /** Bounds memory against a flood of distinct keys. Default: 10,000 buckets. */
  maxBuckets?: number;
}

// Not a precise LRU -- evicts in Map insertion order, which for this Map
// (re-`set` on an existing key doesn't move it) is closer to FIFO-by-
// first-seen. Good enough to bound memory against an unbounded flood of
// distinct keys; precision doesn't matter for that goal.
function evictOldestIfOverCapacity<K, V>(map: Map<K, V>, maxSize: number): void {
  while (map.size > maxSize) {
    const oldestKey = map.keys().next().value;
    if (oldestKey === undefined) break;
    map.delete(oldestKey);
  }
}

export function createInMemoryRateLimiter({
  capacity,
  refillPerSecond,
  now = Date.now,
  maxBuckets = 10_000,
}: InMemoryRateLimiterOptions): RateLimiter {
  const buckets = new Map<string, { tokens: number; lastRefillMs: number }>();

  return {
    async consume(key: string): Promise<RateLimitResult> {
      const currentMs = now();
      const bucket = buckets.get(key) ?? { tokens: capacity, lastRefillMs: currentMs };

      const elapsedSeconds = Math.max(0, (currentMs - bucket.lastRefillMs) / 1000);
      const refreshed = Math.min(capacity, bucket.tokens + elapsedSeconds * refillPerSecond);

      const allowed = refreshed >= 1;
      const tokens = allowed ? refreshed - 1 : refreshed;

      buckets.set(key, { tokens, lastRefillMs: currentMs });
      evictOldestIfOverCapacity(buckets, maxBuckets);

      return { allowed, remaining: Math.floor(tokens) };
    },
  };
}

type FetchFn = typeof fetch;

export interface UpstashRateLimiterOptions {
  url: string;
  token: string;
  limit: number;
  windowSeconds: number;
  fetchImpl?: FetchFn;
}

export function createUpstashRateLimiter({
  url,
  token,
  limit,
  windowSeconds,
  fetchImpl = fetch,
}: UpstashRateLimiterOptions): RateLimiter {
  return {
    async consume(key: string): Promise<RateLimitResult> {
      const redisKey = `ratelimit:${key}`;
      const response = await fetchImpl(`${url}/pipeline`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify([
          ["INCR", redisKey],
          ["EXPIRE", redisKey, String(windowSeconds), "NX"],
        ]),
      });

      if (!response.ok) {
        throw new Error(`Upstash rate limit request failed: ${response.status} ${await response.text()}`);
      }

      const body = (await response.json()) as Array<{ result: number }>;
      // Known fail-open behavior: if the Upstash pipeline response is
      // malformed or missing the expected shape, `count` defaults to 0 and
      // the request is allowed regardless of the real count. Acceptable
      // for a demo app (an outage/format-change fails open rather than
      // taking the whole app down), but worth being explicit about.
      const count = body[0]?.result ?? 0;

      return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
    },
  };
}

let cached: RateLimiter | null = null;

/**
 * Known limitation: callers key rate limiting on the `x-forwarded-for`
 * request header, which is fully attacker-controlled on a request that
 * reaches this app directly (there's no trusted reverse proxy in front of
 * a local `next dev`/`next start` process to strip or overwrite it) --
 * rotating the header defeats the limiter entirely. On this project's
 * actual deploy target, Vercel's edge network sets its own trustworthy
 * `x-forwarded-for` for traffic that reaches it externally, which is a
 * real (if partial) mitigation in production, but not something this code
 * can verify or enforce itself.
 */
export function getRateLimiter(): RateLimiter {
  if (cached) return cached;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  cached = url && token
    ? createUpstashRateLimiter({ url, token, limit: 20, windowSeconds: 60 })
    : createInMemoryRateLimiter({ capacity: 20, refillPerSecond: 20 / 60 });
  return cached;
}

/**
 * Consumes from the given limiter, failing open (allowing the request) if
 * the limiter itself throws -- e.g. an Upstash outage or network error.
 * Deliberate policy for this app: a rate-limiter dependency being down
 * should not take the whole app down with it. The error is logged
 * server-side so an outage is still visible in the request log.
 */
export async function consumeRateLimit(limiter: RateLimiter, key: string): Promise<RateLimitResult> {
  try {
    return await limiter.consume(key);
  } catch (error) {
    console.error("Rate limiter consume() failed; failing open for this request:", error);
    return { allowed: true, remaining: -1 };
  }
}

export function resetRateLimiterForTests(): void {
  cached = null;
}
