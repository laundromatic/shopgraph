import { randomBytes, randomUUID } from 'node:crypto';
import type { Redis } from '@upstash/redis';
import type { Customer } from './types.js';
import { generateApiKey, hashApiKey, storeApiKey } from './api-keys.js';

const MAGIC_LINK_TTL = 15 * 60; // 15 minutes in seconds

/**
 * Create a magic link token and store it in Redis with 15-minute TTL.
 * Returns the token (32-char hex).
 */
export async function createMagicLink(redis: Redis, email: string): Promise<string> {
  const token = randomBytes(16).toString('hex');
  await redis.set(`magiclink:${token}`, email, { ex: MAGIC_LINK_TTL });
  return token;
}

/**
 * Verify a magic link token. Returns email if valid, null if expired/invalid.
 * Deletes the token after verification (single-use).
 */
export async function verifyMagicLink(redis: Redis, token: string): Promise<string | null> {
  const key = `magiclink:${token}`;
  const email = await redis.get<string>(key);
  if (!email) return null;
  await redis.del(key);
  return email;
}

/**
 * Find an existing customer by email, or create a new one.
 * Returns the customer and (only on creation) the raw API key.
 */
export async function findOrCreateCustomer(
  redis: Redis,
  email: string,
): Promise<{ customer: Customer; apiKey?: string }> {
  // Check if customer already exists
  const existingId = await redis.get<string>(`customer:email:${email}`);
  if (existingId) {
    const data = await redis.get<string>(`customer:${existingId}`);
    if (data) {
      const customer: Customer = typeof data === 'string' ? JSON.parse(data) : data as unknown as Customer;
      return { customer };
    }
  }

  // Create new customer
  const apiKey = generateApiKey();
  const customer: Customer = {
    id: randomUUID(),
    email,
    tier: 'free',
    apiKeyHash: hashApiKey(apiKey),
    createdAt: new Date().toISOString(),
  };

  await storeApiKey(redis, customer.apiKeyHash, customer);
  await redis.set(`customer:${customer.id}`, JSON.stringify(customer));
  await redis.set(`customer:email:${email}`, customer.id);

  return { customer, apiKey };
}
