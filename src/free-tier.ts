import { FREE_TIER } from './types.js';

/**
 * Tracks free tier usage per client per month.
 * Uses in-memory storage (resets on cold start — acceptable for serverless).
 *
 * For persistent tracking across cold starts, upgrade to Upstash KV.
 * Current approach: generous — cold starts reset the counter, giving
 * users slightly more than 200/month. This is fine for launch.
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
