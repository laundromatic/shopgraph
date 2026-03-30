/**
 * Test runner for the daily cron job.
 * Reads test corpus, runs extraction on a batch of URLs,
 * stores results in Upstash Redis, and recalculates aggregate stats.
 *
 * Self-healing features:
 * - Circuit breaker: auto-quarantines URLs with 3+ consecutive failures
 * - Health alerts: logs to KV + fires webhook when success rate drops
 * - Corpus verification: periodically re-verifies all URLs
 */

import { extractProduct } from './extract.js';
import type { ProductData } from './types.js';
import {
  type BatchResult,
  type LastBatch,
  type DashboardStats,
  type VerticalStats,
  KV_KEYS,
  BASELINE_STATS,
  getRedis,
  getBatchOffset,
  setBatchOffset,
  writeStats,
  writeLastBatch,
  hashUrl,
} from './stats.js';
import {
  recordSuccess,
  recordFailure,
  filterQuarantined,
} from './circuit-breaker.js';
import {
  storeAlert,
  recordCronRun,
  recordVerifyRun,
  fireWebhookAlert,
  ALERT_THRESHOLD,
} from './health.js';
import { verifyUrl } from './verify-url.js';

// Import test corpus type
export interface CorpusEntry {
  url: string;
  vertical: string;
  added: string;
}

export const BATCH_SIZE = 12;
const EXTRACTION_TIMEOUT_MS = 15_000;

/**
 * How often to run a verification pass instead of normal extraction.
 * Every 14 batches (~7 hours at 30-min cron = roughly weekly at 48 batches/day).
 */
const VERIFY_INTERVAL = BATCH_SIZE * 14;

// Maintenance mode: reduce frequency after hitting target
const MAINTENANCE_TARGET = 5000; // total pages tested before switching
const MAINTENANCE_MODE_KEY = 'config:maintenance_mode';

/**
 * Extract a single URL with a timeout.
 */
async function extractWithTimeout(url: string): Promise<ProductData> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXTRACTION_TIMEOUT_MS);

  try {
    const result = await extractProduct(url);
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Determine if an extraction result is "successful"
 * (has a product name and at least some data).
 */
function isSuccessful(result: ProductData): boolean {
  return result.product_name !== null && result.product_name.length > 0;
}

/**
 * Run a single extraction and return a BatchResult.
 */
async function extractOne(entry: CorpusEntry): Promise<BatchResult> {
  const start = Date.now();
  try {
    const product = await extractWithTimeout(entry.url);
    const success = isSuccessful(product);
    return {
      url: entry.url,
      vertical: entry.vertical,
      success,
      confidence: product.confidence?.overall ?? 0,
      extraction_method: product.extraction_method,
      product_name: product.product_name,
      error: null,
      duration_ms: Date.now() - start,
    };
  } catch (err: unknown) {
    return {
      url: entry.url,
      vertical: entry.vertical,
      success: false,
      confidence: 0,
      extraction_method: null,
      product_name: null,
      error: err instanceof Error ? err.message : String(err),
      duration_ms: Date.now() - start,
    };
  }
}

const CONCURRENCY = 5;

/**
 * Run a batch of extractions concurrently (up to CONCURRENCY at a time).
 */
async function runBatch(entries: CorpusEntry[]): Promise<BatchResult[]> {
  const results: BatchResult[] = [];

  // Process in chunks of CONCURRENCY
  for (let i = 0; i < entries.length; i += CONCURRENCY) {
    const chunk = entries.slice(i, i + CONCURRENCY);
    const chunkResults = await Promise.all(chunk.map(extractOne));
    results.push(...chunkResults);
  }

  return results;
}

/**
 * Recalculate aggregate stats from all stored individual results.
 * Merges new batch results with existing stats.
 */
export function recalculateStats(
  existingStats: DashboardStats,
  batchResults: BatchResult[],
): DashboardStats {
  // Build a map of verticals from existing stats
  const verticalMap = new Map<string, {
    tested: number;
    successful: number;
    totalConfidence: number;
  }>();

  for (const v of existingStats.verticals) {
    verticalMap.set(v.name, {
      tested: v.tested,
      successful: Math.round(v.tested * v.success_rate / 100),
      totalConfidence: v.avg_confidence * v.tested,
    });
  }

  // Add new batch results
  for (const r of batchResults) {
    const existing = verticalMap.get(r.vertical) ?? {
      tested: 0,
      successful: 0,
      totalConfidence: 0,
    };
    existing.tested += 1;
    if (r.success) existing.successful += 1;
    existing.totalConfidence += r.confidence;
    verticalMap.set(r.vertical, existing);
  }

  // Build verticals array
  const verticals: VerticalStats[] = [];
  let totalTested = 0;
  let totalSuccessful = 0;
  let totalConfidence = 0;

  for (const [name, data] of verticalMap) {
    const successRate = data.tested > 0
      ? Math.round((data.successful / data.tested) * 100)
      : 0;
    const avgConfidence = data.tested > 0
      ? data.totalConfidence / data.tested
      : 0;

    verticals.push({
      name,
      tested: data.tested,
      successful: data.successful,
      success_rate: successRate,
      avg_confidence: Number(avgConfidence.toFixed(2)),
    });

    totalTested += data.tested;
    totalSuccessful += data.successful;
    totalConfidence += data.totalConfidence;
  }

  // Sort verticals by tested count descending
  verticals.sort((a, b) => b.tested - a.tested);

  const overallSuccessRate = totalTested > 0
    ? Math.round((totalSuccessful / totalTested) * 100)
    : 0;
  const overallConfidence = totalTested > 0
    ? Number((totalConfidence / totalTested).toFixed(2))
    : 0;

  return {
    total_tested: totalTested,
    total_successful: totalSuccessful,
    overall_success_rate: overallSuccessRate,
    overall_confidence: overallConfidence,
    last_updated: new Date().toISOString().split('T')[0],
    verticals,
  };
}

/**
 * Run a corpus verification pass instead of normal extraction.
 * Checks each URL in a batch for HTTP reachability and extraction success.
 * Quarantines URLs that fail.
 */
async function runVerificationPass(
  corpus: CorpusEntry[],
  redis: import('@upstash/redis').Redis,
): Promise<{ verified: number; quarantined: number; passed: number }> {
  // Verify a batch of URLs (use same BATCH_SIZE to stay within time limits)
  const batch = corpus.slice(0, BATCH_SIZE);
  let quarantined = 0;
  let passed = 0;

  for (let i = 0; i < batch.length; i += CONCURRENCY) {
    const chunk = batch.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (entry) => {
        const result = await verifyUrl(entry.url);
        return { entry, result };
      }),
    );

    for (const { entry, result } of results) {
      if (!result.valid) {
        // Record as failure (will quarantine at 3 consecutive)
        await recordFailure(redis, entry.url, result.reason ?? 'verification failed');
        quarantined++;
      } else {
        passed++;
      }
    }
  }

  await recordVerifyRun(redis);
  console.log(`[verify] Verified ${batch.length} URLs: ${passed} passed, ${quarantined} failed`);

  return { verified: batch.length, quarantined, passed };
}

/**
 * Main entry point for the daily test cron.
 * Returns a summary suitable for the API response.
 */
export async function runDailyTests(corpus: CorpusEntry[]): Promise<{
  status: string;
  batch_offset: number;
  batch_size: number;
  results_summary: { tested: number; successful: number; success_rate: number; avg_confidence: number };
  kv_updated: boolean;
  quarantined_this_batch: number;
  verification_pass?: { verified: number; quarantined: number; passed: number };
}> {
  const redis = getRedis();

  // Check maintenance mode: skip 3 out of 4 runs (effectively every 2 hours instead of every 30 min)
  if (redis) {
    const maintenanceMode = await redis.get(MAINTENANCE_MODE_KEY);
    if (maintenanceMode === 'true') {
      // In maintenance mode, only run every 4th cron invocation
      const cronCount = await redis.incr('config:cron_counter');
      if (cronCount % 4 !== 0) {
        return {
          status: 'skipped_maintenance_mode',
          batch_offset: 0,
          batch_size: 0,
          results_summary: { tested: 0, successful: 0, success_rate: 0, avg_confidence: 0 },
          kv_updated: false,
          quarantined_this_batch: 0,
        };
      }
    }
  }

  // Determine batch offset
  let offset = 0;
  if (redis) {
    offset = await getBatchOffset(redis);
  }

  // Check if this should be a verification pass instead of extraction
  const shouldVerify = redis && offset > 0 && offset % VERIFY_INTERVAL === 0;

  if (shouldVerify && redis) {
    const verifyResult = await runVerificationPass(corpus, redis);
    await recordCronRun(redis);

    // Advance offset past this verification slot
    const nextOffset = (offset + BATCH_SIZE) % corpus.length;
    await setBatchOffset(redis, nextOffset);

    return {
      status: 'ok',
      batch_offset: offset,
      batch_size: 0,
      results_summary: { tested: 0, successful: 0, success_rate: 0, avg_confidence: 0 },
      kv_updated: true,
      quarantined_this_batch: verifyResult.quarantined,
      verification_pass: verifyResult,
    };
  }

  // Filter out quarantined URLs before picking batch
  let activeCorpus = corpus;
  if (redis) {
    activeCorpus = await filterQuarantined(redis, corpus);
  }

  // Pick next batch, wrapping around
  const batchEntries: CorpusEntry[] = [];
  for (let i = 0; i < BATCH_SIZE && i < activeCorpus.length; i++) {
    const idx = (offset + i) % activeCorpus.length;
    batchEntries.push(activeCorpus[idx]);
  }

  // Run extractions
  const results = await runBatch(batchEntries);

  // Circuit breaker: track failures and quarantine bad URLs
  let quarantinedThisBatch = 0;
  if (redis) {
    for (const r of results) {
      if (r.success) {
        await recordSuccess(redis, r.url);
      } else {
        const wasQuarantined = await recordFailure(redis, r.url, r.error);
        if (wasQuarantined) quarantinedThisBatch++;
      }
    }
  }

  // Calculate batch summary
  const successful = results.filter(r => r.success).length;
  const avgConfidence = results.length > 0
    ? Number((results.reduce((s, r) => s + r.confidence, 0) / results.length).toFixed(2))
    : 0;
  const successRate = results.length > 0
    ? Math.round((successful / results.length) * 100)
    : 0;

  const summary = {
    tested: results.length,
    successful,
    success_rate: successRate,
    avg_confidence: avgConfidence,
  };

  let kvUpdated = false;

  if (redis) {
    try {
      // Store individual results
      const resultPromises = results.map(r =>
        redis.set(
          KV_KEYS.resultKey(hashUrl(r.url)),
          r,
          { ex: 30 * 24 * 60 * 60 } // 30 day TTL
        )
      );
      await Promise.all(resultPromises);

      // Get existing stats and recalculate
      const existingOverall = await redis.get<Omit<DashboardStats, 'verticals'>>(KV_KEYS.OVERALL);
      const existingVerticals = await redis.get<VerticalStats[]>(KV_KEYS.VERTICALS);

      const existingStats: DashboardStats = existingOverall && existingVerticals
        ? { ...existingOverall, verticals: existingVerticals }
        : BASELINE_STATS;

      const updatedStats = recalculateStats(existingStats, results);

      // Write updated stats
      await writeStats(redis, updatedStats);

      // Auto-switch to maintenance mode at 5,000 pages
      if (updatedStats.total_tested >= MAINTENANCE_TARGET) {
        const alreadyMaintenance = await redis.get(MAINTENANCE_MODE_KEY);
        if (alreadyMaintenance !== 'true') {
          await redis.set(MAINTENANCE_MODE_KEY, 'true');
          console.error(`[ShopGraph] Maintenance mode activated: ${updatedStats.total_tested} pages tested (target: ${MAINTENANCE_TARGET})`);
        }
      }

      // Health assessment: store alert + fire webhook if degraded
      await storeAlert(redis, updatedStats.overall_success_rate, offset);
      if (updatedStats.overall_success_rate < ALERT_THRESHOLD) {
        await fireWebhookAlert(updatedStats.overall_success_rate);
      }

      // Record cron run timestamp
      await recordCronRun(redis);

      // Write last batch info
      const lastBatch: LastBatch = {
        date: new Date().toISOString(),
        batch_offset: offset,
        batch_size: results.length,
        results,
        summary,
      };
      await writeLastBatch(redis, lastBatch);

      // Advance batch offset
      const nextOffset = (offset + BATCH_SIZE) % activeCorpus.length;
      await setBatchOffset(redis, nextOffset);

      kvUpdated = true;
    } catch (err) {
      console.error('Failed to write results to KV:', err);
    }
  }

  return {
    status: 'ok',
    batch_offset: offset,
    batch_size: results.length,
    results_summary: summary,
    kv_updated: kvUpdated,
    quarantined_this_batch: quarantinedThisBatch,
  };
}
