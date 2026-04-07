/**
 * Dashboard statistics for ShopGraph quality metrics.
 *
 * Reads live stats from Upstash Redis (KV) when configured.
 * Falls back to baseline stats when KV is not available.
 */

import { Redis } from '@upstash/redis';
import { getRedis } from './redis.js';

export interface VerticalStats {
  name: string;
  tested: number;
  successful: number;
  success_rate: number;
  avg_confidence: number;
}

export interface DashboardStats {
  total_tested: number;
  total_successful: number;
  overall_success_rate: number;
  overall_confidence: number;
  last_updated: string;
  verticals: VerticalStats[];
}

export interface BatchResult {
  url: string;
  vertical: string;
  success: boolean;
  confidence: number;
  extraction_method: string | null;
  product_name: string | null;
  error: string | null;
  duration_ms: number;
}

export interface LastBatch {
  date: string;
  batch_offset: number;
  batch_size: number;
  results: BatchResult[];
  summary: {
    tested: number;
    successful: number;
    success_rate: number;
    avg_confidence: number;
  };
}

// KV keys
export const KV_KEYS = {
  OVERALL: 'stats:overall',
  VERTICALS: 'stats:verticals',
  LAST_BATCH: 'stats:last_batch',
  BATCH_OFFSET: 'stats:batch_offset',
  resultKey: (urlHash: string) => `results:${urlHash}`,
} as const;

/**
 * Baseline stats from the 95-URL test run on 2026-03-24.
 * Used when KV is not configured or has no data yet.
 */
export const BASELINE_STATS: DashboardStats = {
  total_tested: 95,
  total_successful: 79,
  overall_success_rate: 89,
  overall_confidence: 0.81,
  last_updated: "2026-03-24",
  verticals: [
    { name: "Fashion & Apparel", tested: 21, successful: 19, success_rate: 90, avg_confidence: 0.86 },
    { name: "Electronics & Tech", tested: 18, successful: 17, success_rate: 94, avg_confidence: 0.73 },
    { name: "Home & Furniture", tested: 13, successful: 10, success_rate: 77, avg_confidence: 0.79 },
    { name: "Health & Beauty", tested: 13, successful: 11, success_rate: 85, avg_confidence: 0.84 },
    { name: "Sports & Outdoors", tested: 7, successful: 7, success_rate: 100, avg_confidence: 0.84 },
    { name: "Jewelry & Accessories", tested: 2, successful: 2, success_rate: 100, avg_confidence: 0.95 },
    { name: "Food & Beverage", tested: 2, successful: 2, success_rate: 100, avg_confidence: 0.82 },
  ],
};

// Re-export getRedis from shared module for backward compatibility
export { getRedis } from './redis.js';

/**
 * Returns current dashboard stats (sync — baseline only).
 * Used for server-rendered HTML where we can't await.
 */
export function getDashboardStats(): DashboardStats {
  return BASELINE_STATS;
}

/**
 * Async version that reads from KV when available.
 */
export async function getDashboardStatsAsync(): Promise<DashboardStats> {
  const redis = getRedis();
  if (!redis) return BASELINE_STATS;

  try {
    const [overall, verticals] = await Promise.all([
      redis.get<Omit<DashboardStats, 'verticals'>>(KV_KEYS.OVERALL),
      redis.get<VerticalStats[]>(KV_KEYS.VERTICALS),
    ]);

    if (!overall || !verticals) return BASELINE_STATS;

    return { ...overall, verticals };
  } catch (err) {
    console.error('Failed to read stats from KV:', err);
    return BASELINE_STATS;
  }
}

/**
 * Write updated stats to KV.
 */
export async function writeStats(
  redis: Redis,
  stats: DashboardStats,
): Promise<void> {
  const { verticals, ...overall } = stats;
  await Promise.all([
    redis.set(KV_KEYS.OVERALL, overall),
    redis.set(KV_KEYS.VERTICALS, verticals),
  ]);
}

/**
 * Write last batch info to KV.
 */
export async function writeLastBatch(
  redis: Redis,
  batch: LastBatch,
): Promise<void> {
  await redis.set(KV_KEYS.LAST_BATCH, batch);
}

/**
 * Get the current batch offset from KV (for rotating through corpus).
 */
export async function getBatchOffset(redis: Redis): Promise<number> {
  const offset = await redis.get<number>(KV_KEYS.BATCH_OFFSET);
  return offset ?? 0;
}

/**
 * Set the batch offset in KV.
 */
export async function setBatchOffset(redis: Redis, offset: number): Promise<void> {
  await redis.set(KV_KEYS.BATCH_OFFSET, offset);
}

/**
 * Create a simple hash of a URL for use as a KV key.
 */
export function hashUrl(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}
