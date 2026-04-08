import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkRateLimit } from '../rate-limiter.js';

function createMockRedis() {
  const store = new Map<string, number>();
  return {
    incr: vi.fn(async (key: string) => {
      const val = (store.get(key) ?? 0) + 1;
      store.set(key, val);
      return val;
    }),
    expire: vi.fn(async () => true),
    _store: store,
  };
}

describe('rate-limiter', () => {
  let mockRedis: ReturnType<typeof createMockRedis>;

  beforeEach(() => {
    mockRedis = createMockRedis();
  });

  it('allows requests under the limit', async () => {
    const result = await checkRateLimit(mockRedis as never, 'client-1', 'free');
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(2);
    expect(result.remaining).toBe(1);
  });

  it('rejects requests over the limit', async () => {
    // Free tier: 2 req/sec
    await checkRateLimit(mockRedis as never, 'client-1', 'free');
    await checkRateLimit(mockRedis as never, 'client-1', 'free');
    const result = await checkRateLimit(mockRedis as never, 'client-1', 'free');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('uses tier-specific limits', async () => {
    const free = await checkRateLimit(mockRedis as never, 'client-free', 'free');
    expect(free.limit).toBe(2);

    const starter = await checkRateLimit(mockRedis as never, 'client-starter', 'starter');
    expect(starter.limit).toBe(10);

    const growth = await checkRateLimit(mockRedis as never, 'client-growth', 'growth');
    expect(growth.limit).toBe(50);

    const enterprise = await checkRateLimit(mockRedis as never, 'client-enterprise', 'enterprise');
    expect(enterprise.limit).toBe(100);
  });

  it('sets TTL on first increment', async () => {
    await checkRateLimit(mockRedis as never, 'client-1', 'free');
    expect(mockRedis.expire).toHaveBeenCalledTimes(1);
    expect(mockRedis.expire).toHaveBeenCalledWith(expect.stringContaining('ratelimit:client-1:'), 2);
  });

  it('does not set TTL on subsequent increments', async () => {
    await checkRateLimit(mockRedis as never, 'client-1', 'free');
    await checkRateLimit(mockRedis as never, 'client-1', 'free');
    expect(mockRedis.expire).toHaveBeenCalledTimes(1);
  });

  it('tracks different clients independently', async () => {
    // Exhaust client-1
    await checkRateLimit(mockRedis as never, 'client-1', 'free');
    await checkRateLimit(mockRedis as never, 'client-1', 'free');
    const blocked = await checkRateLimit(mockRedis as never, 'client-1', 'free');
    expect(blocked.allowed).toBe(false);

    // client-2 should still be allowed
    const allowed = await checkRateLimit(mockRedis as never, 'client-2', 'free');
    expect(allowed.allowed).toBe(true);
  });
});
