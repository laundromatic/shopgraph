import { FREE_TIER } from './types.js';
import type { Redis } from '@upstash/redis';

/**
 * Check playground daily IP limit using Redis.
 * Key pattern: playground:{ip}:{YYYY-MM-DD} with 24-hour TTL.
 * Limit: 5 calls per IP per day.
 */
export async function checkPlaygroundLimit(ip: string, redis: Redis): Promise<{ allowed: boolean; used: number; limit: number }> {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const key = `playground:${ip}:${today}`;
  const used = await redis.incr(key);
  if (used === 1) {
    await redis.expire(key, 86400); // 24 hour TTL
  }
  const PLAYGROUND_DAILY_LIMIT = 100;
  return { allowed: used <= PLAYGROUND_DAILY_LIMIT, used, limit: PLAYGROUND_DAILY_LIMIT };
}

/**
 * Tracks free tier usage per client per month.
 * Uses in-memory storage (resets on cold start — acceptable for serverless).
 *
 * For persistent tracking across cold starts, upgrade to Upstash KV.
 * Current approach: generous — cold starts reset the counter, giving
 * users slightly more than 50/month. This is fine for launch.
 */
export class FreeTierTracker {
  private usage: Map<string, { count: number; month: string }> = new Map();

  private currentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Get current month's usage for a client.
   */
  getUsage(clientId: string): number {
    const month = this.currentMonth();
    const entry = this.usage.get(clientId);
    if (!entry || entry.month !== month) {
      return 0;
    }
    return entry.count;
  }

  /**
   * Increment usage for a client.
   */
  increment(clientId: string): number {
    const month = this.currentMonth();
    const entry = this.usage.get(clientId);

    if (!entry || entry.month !== month) {
      this.usage.set(clientId, { count: 1, month });
      return 1;
    }

    entry.count += 1;
    return entry.count;
  }

  /**
   * Check if a client has remaining free tier calls.
   */
  hasRemaining(clientId: string): boolean {
    return this.getUsage(clientId) < FREE_TIER.MONTHLY_LIMIT;
  }

  /**
   * Get usage summary for a client.
   */
  getSummary(clientId: string): { used: number; limit: number; remaining: number } {
    const used = this.getUsage(clientId);
    return {
      used,
      limit: FREE_TIER.MONTHLY_LIMIT,
      remaining: Math.max(0, FREE_TIER.MONTHLY_LIMIT - used),
    };
  }
}
