/**
 * Leaderboard ingestion and storage.
 *
 * Stores leaderboard entries in Redis (one per domain).
 * Playground submissions feed new entries automatically.
 */

import type { Redis } from '@upstash/redis';
import type { ProductData } from './types.js';
import { scoreAgentReadiness } from './agent-ready.js';
import { createHash } from 'crypto';

const LEADERBOARD_KEY = 'leaderboard:entries';
const SUBMISSION_LOG_PREFIX = 'playground:log:';
const SUBMISSION_LOG_TTL = 30 * 24 * 60 * 60; // 30 days

/** Normalized failure reason codes (from spec Phase 3.1 data contract). */
export type FailureReason =
  | 'bot_detected'
  | 'auth_required'
  | 'page_not_found'
  | 'timeout'
  | 'schema_missing'
  | 'other'
  | null;

export interface LeaderboardEntry {
  domain: string;
  url: string;
  score: number;
  completeness: number;
  semantic: number;
  ucp: number;
  pricing: number;
  inventory: number;
  scored_at: string;
  status: 'live' | 'partial' | 'roadmap';
  extraction_method: string;
  confidence: number;
}

export interface SubmissionLog {
  submitted_at: string;
  url: string;
  domain: string;
  submitter_ip_hash: string;
  extraction_result: 'success' | 'partial' | 'null';
  extraction_method: string | null;
  /** Per-field confidence scores (0–1). Null when extraction produced no data. */
  confidence_by_field: Record<string, number> | null;
  /** Normalized failure reason enum per spec data contract. */
  failure_reason: FailureReason;
  is_gated: boolean;
  added_to_leaderboard: boolean;
}

/** Extract domain from a URL string. */
export function extractDomain(url: string): string {
  try {
    const host = new URL(url).hostname;
    return host.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

/** Check if a URL looks like a product page (not homepage, category, search, etc.) */
export function isProductUrl(url: string): { valid: boolean; reason?: string } {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname;

    // Homepage
    if (path === '/' || path === '') {
      return { valid: false, reason: 'Paste a product page URL. Homepages don\'t contain product data.' };
    }

    // Category / collection pages
    if (/^\/(category|categories|collections|shop|browse|departments?)(\/|$)/i.test(path) && !path.includes('/p/') && !path.includes('/product')) {
      return { valid: false, reason: 'This looks like a category page. Paste a URL for a specific product.' };
    }

    // Search results
    if (parsed.search.includes('q=') || parsed.search.includes('search=') || /\/search(\/|$)/i.test(path)) {
      return { valid: false, reason: 'This looks like a search results page. Paste a URL for a specific product.' };
    }

    // Cart, checkout, account
    if (/^\/(cart|checkout|account|login|register|help|support|contact|about|faq|blog|privacy|terms)(\/|$)/i.test(path)) {
      return { valid: false, reason: 'This isn\'t a product page. Paste a URL for a specific product.' };
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: 'Invalid URL format.' };
  }
}

/** Hash an IP for privacy-safe logging. */
function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

/** Normalize a raw error string to the spec failure reason enum. */
function normalizeFailureReason(error: string | null): FailureReason {
  if (!error) return null;
  const e = error.toLowerCase();
  if (e.includes('403') || e.includes('blocked') || e.includes('captcha') || e.includes('bot')) {
    return 'bot_detected';
  }
  if (e.includes('401') || e.includes('403 forbidden') || e.includes('login') || e.includes('auth') || e.includes('restricted')) {
    return 'auth_required';
  }
  if (e.includes('404') || e.includes('not found')) {
    return 'page_not_found';
  }
  if (e.includes('timeout') || e.includes('timed out') || e.includes('econnreset') || e.includes('etimedout')) {
    return 'timeout';
  }
  if (e.includes('schema') || e.includes('no product') || e.includes('empty')) {
    return 'schema_missing';
  }
  return 'other';
}

/**
 * Log a playground submission to Redis.
 * Returns the log entry, including the generated log key (used to update
 * added_to_leaderboard after ingestion attempt).
 */
export async function logSubmission(
  redis: Redis,
  url: string,
  ip: string,
  product: ProductData | null,
  error: string | null,
): Promise<{ log: SubmissionLog; logKey: string }> {
  const domain = extractDomain(url);
  const isGated = error !== null && (
    error.includes('403') ||
    error.includes('blocked') ||
    error.includes('restricted') ||
    error.includes('captcha')
  );

  const hasData = product?.product_name != null;

  const log: SubmissionLog = {
    submitted_at: new Date().toISOString(),
    url,
    domain,
    submitter_ip_hash: hashIp(ip),
    extraction_result: hasData ? 'success' : (product ? 'partial' : 'null'),
    extraction_method: product?.extraction_method ?? null,
    confidence_by_field: product?.confidence?.per_field ?? null,
    failure_reason: normalizeFailureReason(error),
    is_gated: isGated,
    added_to_leaderboard: false,
  };

  // Store log entry
  const logKey = `${SUBMISSION_LOG_PREFIX}${Date.now()}-${hashIp(url)}`;
  await redis.set(logKey, log, { ex: SUBMISSION_LOG_TTL });

  return { log, logKey };
}

/**
 * Try to ingest a successful extraction into the leaderboard.
 * Returns true if the domain was added or updated.
 *
 * Ingestion rules (spec Phase 3.2):
 * - Only if product_name is present (extraction succeeded)
 * - Domain not gated (gated = no product data returned, so this is implicit)
 * - URL must not be homepage/category/search (enforced upstream by isProductUrl)
 * - Updates existing entry if new score >= old score or confidence is higher
 *
 * @param logKey   Optional Redis key of the submission log to update
 *                 added_to_leaderboard after ingestion.
 */
export async function tryIngestToLeaderboard(
  redis: Redis,
  url: string,
  product: ProductData,
  logKey?: string,
): Promise<boolean> {
  const domain = extractDomain(url);
  if (!domain) return false;

  // Must have product data (gated sites implicitly excluded — they return no product_name)
  if (!product.product_name) return false;

  // Score it
  const agentScore = scoreAgentReadiness(product);
  const overall = Math.round(agentScore.agent_readiness_score);

  // Get dimension scores
  const dims = agentScore.scoring_breakdown;
  const entry: LeaderboardEntry = {
    domain,
    url,
    score: overall,
    completeness: Math.round(dims.structured_data_completeness.score),
    semantic: Math.round(dims.semantic_richness.score),
    ucp: Math.round(dims.ucp_compatibility.score),
    pricing: Math.round(dims.pricing_clarity.score),
    inventory: Math.round(dims.inventory_signal_quality.score),
    scored_at: new Date().toISOString(),
    status: 'live',
    extraction_method: product.extraction_method,
    confidence: product.confidence.overall,
  };

  // Get existing entries
  const existing = await redis.get<LeaderboardEntry[]>(LEADERBOARD_KEY) ?? [];

  // Check if domain already exists
  const idx = existing.findIndex(e => e.domain.toLowerCase() === domain.toLowerCase());
  let ingested = false;

  if (idx >= 0) {
    // Update if new score is higher or data is more complete
    const old = existing[idx];
    if (entry.score >= old.score || entry.confidence > old.confidence) {
      existing[idx] = entry;
      await redis.set(LEADERBOARD_KEY, existing);
      ingested = true;
    }
  } else {
    // New domain — add it
    existing.push(entry);
    await redis.set(LEADERBOARD_KEY, existing);
    ingested = true;
  }

  // Update added_to_leaderboard flag in the submission log
  if (ingested && logKey) {
    const logEntry = await redis.get<SubmissionLog>(logKey);
    if (logEntry) {
      await redis.set(logKey, { ...logEntry, added_to_leaderboard: true }, { ex: SUBMISSION_LOG_TTL });
    }
  }

  return ingested;
}

/**
 * Collapse duplicates in the leaderboard — keep the most recent entry per domain.
 * Returns the number of entries removed.
 */
export async function deduplicateLeaderboard(redis: Redis): Promise<number> {
  const existing = await redis.get<LeaderboardEntry[]>(LEADERBOARD_KEY) ?? [];
  const seen = new Map<string, LeaderboardEntry>();

  for (const entry of existing) {
    const key = entry.domain.toLowerCase();
    const prev = seen.get(key);
    if (!prev || new Date(entry.scored_at) > new Date(prev.scored_at)) {
      seen.set(key, entry);
    }
  }

  const deduped = Array.from(seen.values());
  const removed = existing.length - deduped.length;

  if (removed > 0) {
    await redis.set(LEADERBOARD_KEY, deduped);
  }

  return removed;
}

/**
 * Get all leaderboard entries from Redis.
 */
export async function getLeaderboardEntries(redis: Redis | null): Promise<LeaderboardEntry[]> {
  if (!redis) return [];

  const entries = await redis.get<LeaderboardEntry[]>(LEADERBOARD_KEY);
  return entries ?? [];
}

export interface SubmissionStats {
  /** Date range of stats (last 30 days). */
  period_days: number;
  total_submissions: number;
  success_count: number;
  partial_count: number;
  null_count: number;
  success_rate_pct: number;
  failure_reason_breakdown: Record<string, number>;
  top_gated_domains: string[];
  new_domains_added: number;
  generated_at: string;
}

/**
 * Scan submission logs stored in Redis and produce internal metrics.
 * Used for Phase 4 daily digest (internal only, not user-facing).
 *
 * Note: Redis SCAN is used to avoid blocking — large sets of keys are
 * iterated in batches. Scans all keys matching `playground:log:*`.
 */
export async function getSubmissionStats(redis: Redis): Promise<SubmissionStats> {
  const logs: SubmissionLog[] = [];

  // Scan for all playground log keys
  let cursor = 0;
  do {
    const result = await redis.scan(cursor, { match: `${SUBMISSION_LOG_PREFIX}*`, count: 100 });
    cursor = result[0] as unknown as number;
    const keys = result[1] as string[];
    if (keys.length > 0) {
      // Fetch in batches via pipeline
      const batch = await Promise.all(keys.map(k => redis.get<SubmissionLog>(k)));
      for (const entry of batch) {
        if (entry) logs.push(entry);
      }
    }
  } while (cursor !== 0);

  const total = logs.length;
  const success = logs.filter(l => l.extraction_result === 'success').length;
  const partial = logs.filter(l => l.extraction_result === 'partial').length;
  const nullCount = logs.filter(l => l.extraction_result === 'null').length;

  const failureBreakdown: Record<string, number> = {};
  for (const log of logs) {
    if (log.failure_reason) {
      failureBreakdown[log.failure_reason] = (failureBreakdown[log.failure_reason] ?? 0) + 1;
    }
  }

  // Top gated domains: domains where is_gated=true, sorted by frequency
  const gatedCount: Record<string, number> = {};
  for (const log of logs) {
    if (log.is_gated && log.domain) {
      gatedCount[log.domain] = (gatedCount[log.domain] ?? 0) + 1;
    }
  }
  const topGated = Object.entries(gatedCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([d]) => d);

  const newDomainsAdded = logs.filter(l => l.added_to_leaderboard).length;

  return {
    period_days: 30,
    total_submissions: total,
    success_count: success,
    partial_count: partial,
    null_count: nullCount,
    success_rate_pct: total > 0 ? Math.round((success / total) * 100) : 0,
    failure_reason_breakdown: failureBreakdown,
    top_gated_domains: topGated,
    new_domains_added: newDomainsAdded,
    generated_at: new Date().toISOString(),
  };
}
