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
}

export function createInMemoryRateLimiter({ capacity, refillPerSecond, now = Date.now }: InMemoryRateLimiterOptions): RateLimiter {
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
      const count = body[0]?.result ?? 0;

      return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
    },
  };
}

let cached: RateLimiter | null = null;

export function getRateLimiter(): RateLimiter {
  if (cached) return cached;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  cached = url && token
    ? createUpstashRateLimiter({ url, token, limit: 20, windowSeconds: 60 })
    : createInMemoryRateLimiter({ capacity: 20, refillPerSecond: 20 / 60 });
  return cached;
}

export function resetRateLimiterForTests(): void {
  cached = null;
}
