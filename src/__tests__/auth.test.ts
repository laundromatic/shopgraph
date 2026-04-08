import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMagicLink, verifyMagicLink, findOrCreateCustomer } from '../auth.js';

function createMockRedis() {
  const store = new Map<string, string>();
  return {
    set: vi.fn(async (key: string, value: string, _opts?: unknown) => {
      store.set(key, typeof value === 'string' ? value : JSON.stringify(value));
      return 'OK';
    }),
    get: vi.fn(async (key: string) => {
      const val = store.get(key);
      if (val === undefined) return null;
      // Try parsing JSON for customer objects
      try {
        return JSON.parse(val);
      } catch {
        return val;
      }
    }),
    del: vi.fn(async (key: string) => {
      store.delete(key);
      return 1;
    }),
    _store: store,
  };
}

describe('auth - magic links', () => {
  let mockRedis: ReturnType<typeof createMockRedis>;

  beforeEach(() => {
    mockRedis = createMockRedis();
  });

  describe('createMagicLink', () => {
    it('returns a 32-character hex token', async () => {
      const token = await createMagicLink(mockRedis as never, 'test@example.com');
      expect(token).toMatch(/^[a-f0-9]{32}$/);
    });

    it('stores email in Redis with magiclink: prefix', async () => {
      const token = await createMagicLink(mockRedis as never, 'test@example.com');
      expect(mockRedis.set).toHaveBeenCalledWith(
        `magiclink:${token}`,
        'test@example.com',
        { ex: 15 * 60 },
      );
    });

    it('generates unique tokens', async () => {
      const token1 = await createMagicLink(mockRedis as never, 'a@example.com');
      const token2 = await createMagicLink(mockRedis as never, 'b@example.com');
      expect(token1).not.toBe(token2);
    });
  });

  describe('verifyMagicLink', () => {
    it('returns email for valid token', async () => {
      const token = await createMagicLink(mockRedis as never, 'test@example.com');
      const email = await verifyMagicLink(mockRedis as never, token);
      expect(email).toBe('test@example.com');
    });

    it('returns null for invalid token', async () => {
      const email = await verifyMagicLink(mockRedis as never, 'nonexistent');
      expect(email).toBeNull();
    });

    it('deletes token after verification (single-use)', async () => {
      const token = await createMagicLink(mockRedis as never, 'test@example.com');
      await verifyMagicLink(mockRedis as never, token);
      expect(mockRedis.del).toHaveBeenCalledWith(`magiclink:${token}`);

      // Second verification should fail
      const email = await verifyMagicLink(mockRedis as never, token);
      expect(email).toBeNull();
    });
  });

  describe('findOrCreateCustomer', () => {
    it('creates a new customer with API key on first call', async () => {
      const result = await findOrCreateCustomer(mockRedis as never, 'new@example.com');
      expect(result.customer).toBeDefined();
      expect(result.customer.email).toBe('new@example.com');
      expect(result.customer.tier).toBe('free');
      expect(result.apiKey).toBeDefined();
      expect(result.apiKey).toMatch(/^sg_live_/);
    });

    it('returns existing customer without API key on subsequent calls', async () => {
      const first = await findOrCreateCustomer(mockRedis as never, 'existing@example.com');
      expect(first.apiKey).toBeDefined();

      const second = await findOrCreateCustomer(mockRedis as never, 'existing@example.com');
      expect(second.customer.id).toBe(first.customer.id);
      expect(second.apiKey).toBeUndefined();
    });

    it('stores customer in Redis with correct keys', async () => {
      const { customer } = await findOrCreateCustomer(mockRedis as never, 'store@example.com');

      // Should store: apikey:{hash}, customer:{id}, customer:email:{email}
      const setCalls = mockRedis.set.mock.calls.map((c) => c[0] as string);
      expect(setCalls).toContain(`customer:${customer.id}`);
      expect(setCalls).toContain(`customer:email:store@example.com`);
      expect(setCalls.some((k) => k.startsWith('apikey:'))).toBe(true);
    });
  });
});
