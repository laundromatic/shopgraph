import type { Redis } from '@upstash/redis';
import { TIER_CONFIGS, type SubscriptionTier } from './types.js';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
}

/**
 * Sliding-window rate limiter using Redis INCR with per-second keys.
 * Key: `ratelimit:{clientId}:{epoch_second}` with 2-second TTL.
 */
export async function checkRateLimit(
  redis: Redis,
  clientId: string,
  tier: SubscriptionTier,
): Promise<RateLimitResult> {
  const limit = TIER_CONFIGS[tier].rateLimit;
  const second = Math.floor(Date.now() / 1000);
  const key = `ratelimit:${clientId}:${second}`;

  const count = await redis.incr(key);

  // Set TTL on first increment so the key auto-expires
  if (count === 1) {
    await redis.expire(key, 2);
  }

  const allowed = count <= limit;
  const remaining = Math.max(0, limit - count);

  return { allowed, limit, remaining };
}
