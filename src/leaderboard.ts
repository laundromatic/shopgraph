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
  confidence: number;
  failure_reason: string | null;
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

/**
 * Log a playground submission to Redis.
 */
export async function logSubmission(
  redis: Redis,
  url: string,
  ip: string,
  product: ProductData | null,
  error: string | null,
): Promise<SubmissionLog> {
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
    confidence: product?.confidence?.overall ?? 0,
    failure_reason: error,
    is_gated: isGated,
    added_to_leaderboard: false,
  };

  // Store log entry
  const logKey = `${SUBMISSION_LOG_PREFIX}${Date.now()}-${hashIp(url)}`;
  await redis.set(logKey, log, { ex: SUBMISSION_LOG_TTL });

  return log;
}

/**
 * Try to ingest a successful extraction into the leaderboard.
 * Returns true if the domain was added or updated.
 */
export async function tryIngestToLeaderboard(
  redis: Redis,
  url: string,
  product: ProductData,
): Promise<boolean> {
  const domain = extractDomain(url);
  if (!domain) return false;

  // Must have product data
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

  if (idx >= 0) {
    // Update if new score is higher or data is more complete
    const old = existing[idx];
    if (entry.score >= old.score || entry.confidence > old.confidence) {
      existing[idx] = entry;
      await redis.set(LEADERBOARD_KEY, existing);
      return true;
    }
    return false;
  }

  // New domain — add it
  existing.push(entry);
  await redis.set(LEADERBOARD_KEY, existing);
  return true;
}

/**
 * Get all leaderboard entries, merging Redis data with seed data.
 * Redis entries take precedence over seed entries for the same domain.
 */
export async function getLeaderboardEntries(redis: Redis | null): Promise<LeaderboardEntry[]> {
  if (!redis) return [];

  const entries = await redis.get<LeaderboardEntry[]>(LEADERBOARD_KEY);
  return entries ?? [];
}
