import { describe, it, expect, vi, beforeEach } from 'vitest';
import { incrementUsage, getUsage, checkLimit, getUsageSummary } from '../subscriptions.js';

// Mock Redis
function createMockRedis() {
  const store = new Map<string, number>();
  return {
    incr: vi.fn(async (key: string) => {
      const val = (store.get(key) ?? 0) + 1;
      store.set(key, val);
      return val;
    }),
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    expire: vi.fn(async () => true),
    _store: store,
  };
}

describe('subscriptions', () => {
  let mockRedis: ReturnType<typeof createMockRedis>;

  beforeEach(() => {
    mockRedis = createMockRedis();
  });

  describe('incrementUsage', () => {
    it('increments and returns count', async () => {
      const count = await incrementUsage(mockRedis as never, 'cust-1');
      expect(count).toBe(1);

      const count2 = await incrementUsage(mockRedis as never, 'cust-1');
      expect(count2).toBe(2);
    });

    it('sets TTL on first increment', async () => {
      await incrementUsage(mockRedis as never, 'cust-1');
      expect(mockRedis.expire).toHaveBeenCalledTimes(1);
      expect(mockRedis.expire).toHaveBeenCalledWith(expect.stringContaining('usage:cust-1:'), 45 * 24 * 60 * 60);
    });

    it('does not set TTL on subsequent increments', async () => {
      await incrementUsage(mockRedis as never, 'cust-1');
      await incrementUsage(mockRedis as never, 'cust-1');
      // expire only called once (count === 1 on first call)
      expect(mockRedis.expire).toHaveBeenCalledTimes(1);
    });
  });

  describe('getUsage', () => {
    it('returns 0 for unknown customer', async () => {
      const usage = await getUsage(mockRedis as never, 'unknown');
      expect(usage).toBe(0);
    });

    it('returns current count after increments', async () => {
      await incrementUsage(mockRedis as never, 'cust-1');
      await incrementUsage(mockRedis as never, 'cust-1');
      await incrementUsage(mockRedis as never, 'cust-1');
      const usage = await getUsage(mockRedis as never, 'cust-1');
      expect(usage).toBe(3);
    });
  });

  describe('checkLimit', () => {
    it('allows usage under the limit', async () => {
      const result = await checkLimit(mockRedis as never, 'cust-1', 'free');
      expect(result.allowed).toBe(true);
      expect(result.used).toBe(0);
      expect(result.limit).toBe(50);
    });

    it('denies usage at the limit', async () => {
      // Simulate being at the limit
      const month = new Date();
      const monthStr = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
      mockRedis._store.set(`usage:cust-1:${monthStr}`, 50);

      const result = await checkLimit(mockRedis as never, 'cust-1', 'free');
      expect(result.allowed).toBe(false);
      expect(result.used).toBe(50);
    });

    it('uses correct limit per tier', async () => {
      const free = await checkLimit(mockRedis as never, 'cust-1', 'free');
      expect(free.limit).toBe(500);

      const starter = await checkLimit(mockRedis as never, 'cust-1', 'starter');
      expect(starter.limit).toBe(10_000);

      const growth = await checkLimit(mockRedis as never, 'cust-1', 'growth');
      expect(growth.limit).toBe(50_000);

      const enterprise = await checkLimit(mockRedis as never, 'cust-1', 'enterprise');
      expect(enterprise.limit).toBe(Infinity);
    });

    it('enterprise tier is always allowed', async () => {
      // Even with high usage, Infinity limit means always allowed
      const month = new Date();
      const monthStr = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
      mockRedis._store.set(`usage:cust-1:${monthStr}`, 1_000_000);

      const result = await checkLimit(mockRedis as never, 'cust-1', 'enterprise');
      expect(result.allowed).toBe(true);
    });
  });

  describe('getUsageSummary', () => {
    it('returns correct summary', async () => {
      await incrementUsage(mockRedis as never, 'cust-1');
      await incrementUsage(mockRedis as never, 'cust-1');
      await incrementUsage(mockRedis as never, 'cust-1');

      const summary = await getUsageSummary(mockRedis as never, 'cust-1', 'free');
      expect(summary).toEqual({ used: 3, limit: 50, remaining: 47 });
    });

    it('returns 0 remaining when over limit', async () => {
      const month = new Date();
      const monthStr = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
      mockRedis._store.set(`usage:cust-1:${monthStr}`, 600);

      const summary = await getUsageSummary(mockRedis as never, 'cust-1', 'free');
      expect(summary).toEqual({ used: 600, limit: 50, remaining: 0 });
    });
  });
});
