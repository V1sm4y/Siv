import 'server-only';
import { env } from '@arena/config';
import { Redis } from 'ioredis';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

const memory = new Map<string, { count: number; resetAt: number }>();

function memoryHit(key: string, limit: number, windowSec: number): RateLimitResult {
  const now = Date.now();
  const cur = memory.get(key);
  if (!cur || cur.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return { allowed: true, remaining: limit - 1, retryAfterSec: 0 };
  }
  cur.count += 1;
  const retryAfterSec = Math.ceil((cur.resetAt - now) / 1000);
  return { allowed: cur.count <= limit, remaining: Math.max(0, limit - cur.count), retryAfterSec };
}

let redis: Redis | null | undefined;
function client(): Redis | null {
  if (redis !== undefined) return redis;
  const url = env().REDIS_URL;
  if (!url) return (redis = null);
  // Offline queue lets the first request wait for the connection; the short timeouts bound it, then we fall back.
  redis = new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: true, connectTimeout: 1500, commandTimeout: 500 });
  redis.on('error', () => {}); // fail-open to the in-memory limiter; logged once per call below
  return redis;
}

/**
 * Fixed-window limiter. Redis when configured (shared across instances); if Redis is down we degrade to
 * a per-process limiter instead of failing requests (fail-open, still bounded).
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<RateLimitResult> {
  const r = client();
  if (r) {
    try {
      const k = `rl:${key}`;
      const [[, count], [, ttl]] = (await r.multi().incr(k).ttl(k).exec()) as [[null, number], [null, number]];
      if (ttl < 0) await r.expire(k, windowSec);
      return {
        allowed: count <= limit,
        remaining: Math.max(0, limit - count),
        retryAfterSec: count > limit ? Math.max(1, ttl) : 0,
      };
    } catch (err) {
      console.warn('[rate-limit] redis unavailable, using in-memory limiter:', (err as Error).message);
    }
  }
  return memoryHit(key, limit, windowSec);
}
