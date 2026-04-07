import type { Redis } from '@upstash/redis';
import { TIER_CONFIGS, type SubscriptionTier } from './types.js';

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export async function incrementUsage(redis: Redis, customerId: string): Promise<number> {
  const key = `usage:${customerId}:${currentMonth()}`;
  const count = await redis.incr(key);
  // Set TTL on first increment (45 days)
  if (count === 1) {
    await redis.expire(key, 45 * 24 * 60 * 60);
  }
  return count;
}

export async function getUsage(redis: Redis, customerId: string): Promise<number> {
  const key = `usage:${customerId}:${currentMonth()}`;
  const count = await redis.get<number>(key);
  return count ?? 0;
}

export async function checkLimit(
  redis: Redis,
  customerId: string,
  tier: SubscriptionTier,
): Promise<{ allowed: boolean; used: number; limit: number }> {
  const used = await getUsage(redis, customerId);
  const limit = TIER_CONFIGS[tier].monthlyLimit;
  return { allowed: used < limit, used, limit };
}

export async function getUsageSummary(
  redis: Redis,
  customerId: string,
  tier: SubscriptionTier,
): Promise<{ used: number; limit: number; remaining: number }> {
  const used = await getUsage(redis, customerId);
  const limit = TIER_CONFIGS[tier].monthlyLimit;
  return { used, limit, remaining: Math.max(0, limit - used) };
}
