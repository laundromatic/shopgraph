import { randomBytes, createHash } from 'node:crypto';
import type { Redis } from '@upstash/redis';
import type { Customer } from './types.js';

const API_KEY_PREFIX = 'sg_live_';

export function generateApiKey(): string {
  return API_KEY_PREFIX + randomBytes(16).toString('hex');
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function isValidKeyFormat(key: string): boolean {
  return key.startsWith(API_KEY_PREFIX) && key.length === API_KEY_PREFIX.length + 32;
}

export async function storeApiKey(
  redis: Redis,
  apiKeyHash: string,
  customer: Customer,
): Promise<void> {
  await redis.set(`apikey:${apiKeyHash}`, JSON.stringify(customer));
}

export async function lookupApiKey(
  redis: Redis,
  rawKey: string,
): Promise<Customer | null> {
  if (!isValidKeyFormat(rawKey)) return null;
  const hash = hashApiKey(rawKey);
  const data = await redis.get<string>(`apikey:${hash}`);
  if (!data) return null;
  return typeof data === 'string' ? JSON.parse(data) : data as unknown as Customer;
}

export async function revokeApiKey(redis: Redis, apiKeyHash: string): Promise<void> {
  await redis.del(`apikey:${apiKeyHash}`);
}
