/**
 * Regression test generation for ShopGraph.
 *
 * After high-confidence, LLM-validated extractions, snapshots are saved
 * as regression fixtures. On subsequent extractions of the same URL,
 * results are compared against the snapshot to detect significant divergence.
 */

import type { Redis } from '@upstash/redis';
import type { ProductData } from './types.js';
import { hashUrl } from './stats.js';

export interface RegressionSnapshot {
  url: string;
  snapshot_at: string;
  product_name: string | null;
  brand: string | null;
  price_amount: number | null;
  price_currency: string | null;
  availability: string;
  confidence_overall: number;
}

export interface RegressionCheck {
  regressed: boolean;
  changes: Record<string, { old: unknown; new: unknown }>;
}

const SNAPSHOT_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days

/**
 * Save a regression snapshot for a URL after high-confidence extraction.
 */
export async function saveSnapshot(
  redis: Redis,
  url: string,
  product: ProductData,
): Promise<void> {
  const snapshot: RegressionSnapshot = {
    url,
    snapshot_at: new Date().toISOString(),
    product_name: product.product_name,
    brand: product.brand,
    price_amount: product.price?.amount ?? null,
    price_currency: product.price?.currency ?? null,
    availability: product.availability,
    confidence_overall: product.confidence.overall,
  };

  const key = `regression:${hashUrl(url)}`;
  await redis.set(key, snapshot, { ex: SNAPSHOT_TTL_SECONDS });
}

/**
 * Check current extraction against a saved regression snapshot.
 * Flags significant divergence: product_name changed, price changed >10%,
 * availability flipped.
 */
export async function checkRegression(
  redis: Redis,
  url: string,
  product: ProductData,
): Promise<RegressionCheck> {
  const key = `regression:${hashUrl(url)}`;
  const snapshot = await redis.get<RegressionSnapshot>(key);

  if (!snapshot) {
    return { regressed: false, changes: {} };
  }

  const changes: Record<string, { old: unknown; new: unknown }> = {};

  // Check product_name change
  if (
    snapshot.product_name !== null &&
    product.product_name !== null &&
    snapshot.product_name.toLowerCase() !== product.product_name.toLowerCase()
  ) {
    changes.product_name = { old: snapshot.product_name, new: product.product_name };
  }

  // Check price change >10%
  const oldPrice = snapshot.price_amount;
  const newPrice = product.price?.amount ?? null;
  if (oldPrice !== null && newPrice !== null && oldPrice > 0) {
    const priceDiff = Math.abs(newPrice - oldPrice) / oldPrice;
    if (priceDiff > 0.10) {
      changes.price_amount = { old: oldPrice, new: newPrice };
    }
  }

  // Check availability flip
  if (
    snapshot.availability !== 'unknown' &&
    product.availability !== 'unknown' &&
    snapshot.availability !== product.availability
  ) {
    changes.availability = { old: snapshot.availability, new: product.availability };
  }

  return {
    regressed: Object.keys(changes).length > 0,
    changes,
  };
}

/**
 * Count active regression snapshots (approximate via scan).
 */
export async function getRegressionCount(redis: Redis): Promise<number> {
  let count = 0;
  let cursor = 0;
  do {
    const [nextCursor, keys] = await redis.scan(cursor, { match: 'regression:*', count: 100 });
    cursor = typeof nextCursor === 'string' ? parseInt(nextCursor, 10) : nextCursor;
    count += keys.length;
  } while (cursor !== 0);
  return count;
}
