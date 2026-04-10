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

import { extractProduct, extractBasicFromUrl, fetchPage } from './extract.js';
import type { ProductData, CorpusEntry } from './types.js';
import {
  type BatchResult,
  type LastBatch,
  type DashboardStats,
  type VerticalStats,
  type FieldResults,
  type FieldStats,
  type SegmentStats,
  type MethodRatioStats,
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
import { validateExtraction } from './llm-extract.js';
import { saveSnapshot, checkRegression } from './regression.js';

// Re-export CorpusEntry for backward compatibility
export type { CorpusEntry } from './types.js';

export const BATCH_SIZE = 6;
const EXTRACTION_TIMEOUT_MS = 15_000;

/** Number of URLs per batch to run LLM validation on (cost control). */
export const VALIDATION_SAMPLE_SIZE = 3;

/** Counter for how many validations have been done in current batch. */
let _validationCount = 0;

/** Reset the per-batch validation counter. Exported for testing. */
export function resetValidationCount(): void {
  _validationCount = 0;
}

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

const TRACKED_FIELDS = ['product_name', 'brand', 'description', 'price', 'availability', 'categories', 'color', 'material', 'dimensions'];

export function buildFieldResults(product: ProductData, entry: CorpusEntry): FieldResults {
  const fieldsExtracted: string[] = [];

  for (const field of TRACKED_FIELDS) {
    const value = (product as unknown as Record<string, unknown>)[field];
    const isPresent = value !== null && value !== undefined &&
      !(Array.isArray(value) && value.length === 0) &&
      value !== 'unknown';
    if (isPresent) fieldsExtracted.push(field);
  }

  const result: FieldResults = {
    fields_extracted: fieldsExtracted,
    fields_total: TRACKED_FIELDS.length,
    field_completeness: fieldsExtracted.length / TRACKED_FIELDS.length,
    per_field_confidence: { ...(product.confidence?.per_field ?? {}) },
  };

  // Ground truth comparison
  if (entry.ground_truth) {
    const matches: Record<string, boolean> = {};
    const gt = entry.ground_truth;

    if (gt.product_name !== undefined) {
      matches.product_name = product.product_name !== null &&
        product.product_name.toLowerCase().includes(gt.product_name.toLowerCase());
    }
    if (gt.brand !== undefined) {
      matches.brand = product.brand !== null &&
        product.brand.toLowerCase() === gt.brand.toLowerCase();
    }
    if (gt.price_amount !== undefined) {
      matches.price = product.price !== null && product.price.amount !== null &&
        Math.abs(product.price.amount - gt.price_amount) / gt.price_amount < 0.01;
    }
    if (gt.price_currency !== undefined) {
      matches.currency = product.price !== null &&
        product.price.currency === gt.price_currency;
    }
    if (gt.availability !== undefined) {
      matches.availability = product.availability === gt.availability;
    }

    result.ground_truth_match = matches;
    const matchValues = Object.values(matches);
    result.accuracy_score = matchValues.length > 0
      ? matchValues.filter(Boolean).length / matchValues.length
      : undefined;
  }

  return result;
}

/**
 * Run a single extraction and return a BatchResult.
 * Optionally runs LLM validation and regression checks.
 */
async function extractOne(entry: CorpusEntry): Promise<BatchResult> {
  const start = Date.now();
  try {
    const product = await extractWithTimeout(entry.url);
    const success = isSuccessful(product);
    const fieldResults = buildFieldResults(product, entry);

    const enableValidation = process.env.ENABLE_LLM_VALIDATION === 'true';
    const redis = getRedis();

    // LLM validation (cost-controlled: only VALIDATION_SAMPLE_SIZE per batch)
    if (enableValidation && success && _validationCount < VALIDATION_SAMPLE_SIZE) {
      try {
        _validationCount++;
        const html = await fetchPage(entry.url);
        const validation = await validateExtraction(product, html);
        fieldResults.llm_validation = {
          fields_verified: Object.fromEntries(
            Object.entries(validation.fields_verified).map(([k, v]) => [k, v.correct]),
          ),
          overall_accuracy: validation.overall_accuracy,
          duration_ms: validation.duration_ms,
        };
      } catch {
        // Validation is best-effort; don't fail the extraction
      }
    }

    // Cross-signal agreement: if extraction used schema_org, compare with basic extraction
    if (success && product.extraction_method === 'schema_org') {
      try {
        const basicResult = await extractBasicFromUrl(entry.url);
        const agreement: Record<string, boolean> = {};
        if (basicResult.product_name && product.product_name) {
          agreement.product_name = basicResult.product_name.toLowerCase() === product.product_name.toLowerCase();
        }
        if (basicResult.price && product.price) {
          agreement.price = basicResult.price.amount === product.price.amount;
        }
        if (basicResult.availability !== 'unknown' && product.availability !== 'unknown') {
          agreement.availability = basicResult.availability === product.availability;
        }
        if (Object.keys(agreement).length > 0) {
          fieldResults.cross_signal_agreement = agreement;
        }
      } catch {
        // Cross-signal is best-effort
      }
    }

    // Regression check and snapshot
    if (redis && success) {
      try {
        const regressionResult = await checkRegression(redis, entry.url, product);
        if (regressionResult.regressed) {
          console.error(`[regression] Detected regression for ${entry.url}:`, regressionResult.changes);
        }

        // Save snapshot for high-confidence + validated extractions
        const highConfidence = (product.confidence?.overall ?? 0) > 0.85;
        const validated = fieldResults.llm_validation?.overall_accuracy !== undefined
          ? fieldResults.llm_validation.overall_accuracy >= 0.8
          : false;
        if (highConfidence || validated) {
          await saveSnapshot(redis, entry.url, product);
        }
      } catch {
        // Regression is best-effort
      }
    }

    return {
      url: entry.url,
      vertical: entry.vertical,
      segment: entry.segment,
      success,
      confidence: product.confidence?.overall ?? 0,
      extraction_method: product.extraction_method,
      product_name: product.product_name,
      error: null,
      duration_ms: Date.now() - start,
      field_results: fieldResults,
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

  // Reset per-batch validation counter
  resetValidationCount();

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
 * Aggregate per-field extraction rates, confidence, segment breakdown,
 * and golden-set accuracy from a batch of results.
 */
export function aggregateFieldAndSegmentStats(
  batchResults: BatchResult[],
): {
  fieldStats: FieldStats[];
  segmentStats: SegmentStats;
  accuracyStats: { avg_accuracy: number; entries_with_ground_truth: number };
  methodRatioStats: MethodRatioStats;
} {
  // Per-field aggregation
  const fieldCounts: Record<string, { extracted: number; total: number; confidenceSum: number; confidenceCount: number; accurateCount: number; accuracyTotal: number }> = {};

  for (const field of TRACKED_FIELDS) {
    fieldCounts[field] = { extracted: 0, total: 0, confidenceSum: 0, confidenceCount: 0, accurateCount: 0, accuracyTotal: 0 };
  }

  for (const r of batchResults) {
    for (const field of TRACKED_FIELDS) {
      const fc = fieldCounts[field];
      fc.total += 1;

      if (r.field_results) {
        if (r.field_results.fields_extracted.includes(field)) {
          fc.extracted += 1;
        }
        const conf = r.field_results.per_field_confidence[field];
        if (conf !== undefined) {
          fc.confidenceSum += conf;
          fc.confidenceCount += 1;
        }
        if (r.field_results.ground_truth_match && field in r.field_results.ground_truth_match) {
          fc.accuracyTotal += 1;
          if (r.field_results.ground_truth_match[field]) fc.accurateCount += 1;
        }
      }
    }
  }

  const fieldStats: FieldStats[] = TRACKED_FIELDS.map(field => {
    const fc = fieldCounts[field];
    const stat: FieldStats = {
      field_name: field,
      extraction_rate: fc.total > 0 ? fc.extracted / fc.total : 0,
      avg_confidence: fc.confidenceCount > 0 ? fc.confidenceSum / fc.confidenceCount : 0,
    };
    if (fc.accuracyTotal > 0) {
      stat.accuracy_rate = fc.accurateCount / fc.accuracyTotal;
    }
    return stat;
  });

  // Segment aggregation
  const segments: Record<'b2b' | 'b2c', { tested: number; successful: number; confidenceSum: number }> = {
    b2b: { tested: 0, successful: 0, confidenceSum: 0 },
    b2c: { tested: 0, successful: 0, confidenceSum: 0 },
  };

  for (const r of batchResults) {
    if (r.segment && (r.segment === 'b2b' || r.segment === 'b2c')) {
      const s = segments[r.segment];
      s.tested += 1;
      if (r.success) s.successful += 1;
      s.confidenceSum += r.confidence;
    }
  }

  const segmentStats: SegmentStats = {
    b2b: {
      tested: segments.b2b.tested,
      success_rate: segments.b2b.tested > 0 ? segments.b2b.successful / segments.b2b.tested : 0,
      avg_confidence: segments.b2b.tested > 0 ? segments.b2b.confidenceSum / segments.b2b.tested : 0,
    },
    b2c: {
      tested: segments.b2c.tested,
      success_rate: segments.b2c.tested > 0 ? segments.b2c.successful / segments.b2c.tested : 0,
      avg_confidence: segments.b2c.tested > 0 ? segments.b2c.confidenceSum / segments.b2c.tested : 0,
    },
  };

  // Golden set accuracy
  let accuracySum = 0;
  let accuracyCount = 0;
  for (const r of batchResults) {
    if (r.field_results?.accuracy_score !== undefined) {
      accuracySum += r.field_results.accuracy_score;
      accuracyCount += 1;
    }
  }

  const accuracyStats = {
    avg_accuracy: accuracyCount > 0 ? accuracySum / accuracyCount : 0,
    entries_with_ground_truth: accuracyCount,
  };

  // Extraction method ratio
  const methodCounts: Record<string, number> = { schema_org: 0, llm: 0, hybrid: 0, unknown: 0 };
  for (const r of batchResults) {
    const method = r.extraction_method ?? 'unknown';
    if (method in methodCounts) {
      methodCounts[method] += 1;
    } else {
      methodCounts.unknown += 1;
    }
  }
  const total = batchResults.length || 1;
  const methodRatioStats: MethodRatioStats = {
    schema_org: methodCounts.schema_org / total,
    llm: methodCounts.llm / total,
    hybrid: methodCounts.hybrid / total,
    unknown: methodCounts.unknown / total,
    total: batchResults.length,
    // Cost estimates: schema_org=0, llm=0.1c, hybrid=0.5c per extraction
    estimated_cost_cents: (methodCounts.llm * 0.1) + (methodCounts.hybrid * 0.5),
  };

  return { fieldStats, segmentStats, accuracyStats, methodRatioStats };
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

      // Aggregate and store field-level, segment, and accuracy stats
      const { fieldStats, segmentStats, accuracyStats, methodRatioStats } = aggregateFieldAndSegmentStats(results);
      await Promise.all([
        redis.set(KV_KEYS.FIELD_STATS, { fields: fieldStats }),
        redis.set(KV_KEYS.SEGMENT_STATS, segmentStats),
        redis.set(KV_KEYS.ACCURACY_STATS, accuracyStats),
        redis.set(KV_KEYS.METHOD_RATIO, methodRatioStats),
      ]);

      // Field-level and method ratio health alerts
      const { checkFieldHealth, checkMethodRatioHealth } = await import('./health.js');
      await checkFieldHealth(redis, fieldStats);
      await checkMethodRatioHealth(redis, methodRatioStats);

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
