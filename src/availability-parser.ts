/**
 * Structured-signal parser for product availability (LAU-330 ckpt 3/3).
 *
 * Recognises six patterns from page hints + cleaned text and emits a
 * canonical availability value plus a per-pattern confidence baseline. The
 * critical calibration improvement is the `unknown` baseline drop from
 * mid-range (was inherited from LLM_BASE) to 0.30 — currently `unknown`
 * returns high confidence which dominates the bad availability R (-0.01).
 *
 * Confidence baselines (per ticket):
 *   in_stock     0.85
 *   out_of_stock 0.85
 *   low_stock    0.80
 *   backordered  0.75
 *   quote_only   0.70
 *   unknown      0.30 (KEY calibration fix)
 *   preorder     0.80 (back-compat, between low_stock and out_of_stock)
 *
 * The parser does NOT replace the LLM extraction — it runs as a post-step
 * on the LLM's availability output + the raw page signals (priceHints +
 * cleaned text) and chooses the more-specific value when both agree, or
 * falls back to the LLM value when no structured signal is found.
 */
import type { AvailabilityValue } from './types.js';
import type { PriceHints } from './html-cleaner.js';

export interface AvailabilitySignalResult {
  value: AvailabilityValue;
  confidence: number;
  matched_pattern: AvailabilityPattern;
  /** When low_stock and N was extractable, the integer count. */
  quantity_remaining?: number;
}

export type AvailabilityPattern =
  | 'in_stock_signal'
  | 'out_of_stock_signal'
  | 'low_stock_signal'
  | 'backordered_signal'
  | 'quote_only_signal'
  | 'no_signal';

export const AVAILABILITY_CONFIDENCE: Record<AvailabilityValue, number> = {
  in_stock: 0.85,
  out_of_stock: 0.85,
  low_stock: 0.80,
  backordered: 0.75,
  preorder: 0.80,
  quote_only: 0.70,
  unknown: 0.30,
};

// ─── Pattern detectors ───────────────────────────────────────────────
// Order of detection matters: more-specific patterns first. low_stock /
// backordered / quote_only beat in_stock when both signals are present,
// because "Only 2 left" is strictly more informative than "in stock".

const OUT_OF_STOCK_RE = /\b(out\s*of\s*stock|sold\s*out|currently\s*unavailable|not\s*available|notify\s*me\s*when\s*available|waitlist|email\s*when\s*available)\b/i;
const LOW_STOCK_QTY_RE = /\b(?:only\s+)?(\d{1,3})\s+(?:left|remaining|in\s*stock|available)\b/i;
const LOW_STOCK_RE = /\b(low\s*stock|limited\s*stock|hurry|almost\s*gone|few\s*left|selling\s*fast)\b/i;
const BACKORDER_RE = /\b(back[\s-]*order(?:ed)?|on\s*back[\s-]*order|ships?\s+in\s+\d+\s*(?:business\s+)?(?:day|week|month)s?|pre[\s-]*order|pre[\s-]*sale|coming\s*soon|ships?\s*when\s*available)\b/i;
const QUOTE_ONLY_RE = /\b(quote\s*(?:on\s*request|only|available)|contact\s*(?:us\s*)?for\s*(?:price|pricing|quote|availability)|request\s*(?:a\s*)?(?:quote|pricing)|call\s*for\s*price|price\s*on\s*request|poa|p\.o\.a\.)\b/i;
const IN_STOCK_RE = /\b(in\s*stock|available\s*now|add\s*to\s*(?:cart|bag|basket)|buy\s*now|ready\s*to\s*ship|ships?\s+today|same[\s-]*day\s*shipping)\b/i;

/**
 * Detect the most-specific availability pattern in a free-text blob.
 * Returns `'no_signal'` if nothing matches.
 *
 * Detection order (most-specific first):
 *   1. out_of_stock  — terminal, overrides everything
 *   2. quote_only    — B2B signal, beats stock-status
 *   3. backordered   — explicit delay signal
 *   4. low_stock     — quantified scarcity
 *   5. in_stock      — generic positive signal
 */
export function detectAvailabilityPattern(text: string): {
  pattern: AvailabilityPattern;
  quantity_remaining?: number;
} {
  if (!text) return { pattern: 'no_signal' };

  // 1. out_of_stock first — if a page says BOTH "in stock" (e.g. in nav) and
  // "out of stock" (in the buy-box), prefer out_of_stock. Real shopping UX:
  // out-of-stock buy-boxes are decisive.
  if (OUT_OF_STOCK_RE.test(text)) {
    return { pattern: 'out_of_stock_signal' };
  }

  // 2. quote_only — B2B "Contact for Pricing" wins over any in_stock signal
  // because it indicates non-self-serve commerce.
  if (QUOTE_ONLY_RE.test(text)) {
    return { pattern: 'quote_only_signal' };
  }

  // 3. backordered / pre-order / ships-in-N
  if (BACKORDER_RE.test(text)) {
    return { pattern: 'backordered_signal' };
  }

  // 4. low_stock with optional quantity extraction
  const qtyMatch = text.match(LOW_STOCK_QTY_RE);
  if (qtyMatch) {
    const n = parseInt(qtyMatch[1], 10);
    // Only treat 1-20 as low_stock; "100 available" is not scarcity.
    if (n > 0 && n <= 20) {
      return { pattern: 'low_stock_signal', quantity_remaining: n };
    }
  }
  if (LOW_STOCK_RE.test(text)) {
    return { pattern: 'low_stock_signal' };
  }

  // 5. in_stock generic
  if (IN_STOCK_RE.test(text)) {
    return { pattern: 'in_stock_signal' };
  }

  return { pattern: 'no_signal' };
}

/**
 * Apply structured-signal parsing to a (priceHints, page text) pair plus the
 * LLM's availability output. Returns the parser's recommended value +
 * confidence + matched pattern.
 *
 * Resolution rules:
 *   - If the parser detects a more-specific pattern (low_stock / backordered
 *     / quote_only / out_of_stock), it wins over the LLM value.
 *   - If the parser detects in_stock_signal AND the LLM also says in_stock,
 *     confidence is the in_stock baseline (0.85).
 *   - If the parser detects no_signal and the LLM provided a known value
 *     (in_stock / out_of_stock / preorder), trust the LLM value at its
 *     baseline confidence — minus a small penalty (0.05) since there was
 *     no corroborating page signal.
 *   - If the parser detects no_signal and the LLM said unknown, emit
 *     unknown @ 0.30 (the KEY calibration fix).
 */
export function parseAvailabilitySignals(
  llmValue: AvailabilityValue,
  priceHints: PriceHints,
  pageText: string,
): AvailabilitySignalResult {
  // Combine all the textual signals we have access to. priceHints already
  // surfaced the most relevant matches up-front, so concatenating them with
  // the cleaned page text gives the parser the best chance to match.
  const haystack = [
    priceHints.metaAvailability ?? '',
    priceHints.availabilitySignals.join(' '),
    pageText,
  ]
    .filter(Boolean)
    .join(' \n ');

  const { pattern, quantity_remaining } = detectAvailabilityPattern(haystack);

  switch (pattern) {
    case 'out_of_stock_signal':
      return {
        value: 'out_of_stock',
        confidence: AVAILABILITY_CONFIDENCE.out_of_stock,
        matched_pattern: pattern,
      };
    case 'quote_only_signal':
      return {
        value: 'quote_only',
        confidence: AVAILABILITY_CONFIDENCE.quote_only,
        matched_pattern: pattern,
      };
    case 'backordered_signal':
      // Schema.org PreOrder maps to backordered's wider pattern. If the LLM
      // had specifically pulled 'preorder' from schema.org, preserve that
      // distinction; otherwise emit backordered.
      if (llmValue === 'preorder') {
        return {
          value: 'preorder',
          confidence: AVAILABILITY_CONFIDENCE.preorder,
          matched_pattern: pattern,
        };
      }
      return {
        value: 'backordered',
        confidence: AVAILABILITY_CONFIDENCE.backordered,
        matched_pattern: pattern,
      };
    case 'low_stock_signal':
      return {
        value: 'low_stock',
        confidence: AVAILABILITY_CONFIDENCE.low_stock,
        matched_pattern: pattern,
        ...(quantity_remaining !== undefined ? { quantity_remaining } : {}),
      };
    case 'in_stock_signal':
      return {
        value: 'in_stock',
        confidence: AVAILABILITY_CONFIDENCE.in_stock,
        matched_pattern: pattern,
      };
    case 'no_signal':
    default:
      // No structured signal found. Trust the LLM only if it confidently
      // emitted a known value; otherwise emit unknown @ 0.30.
      if (llmValue === 'in_stock' || llmValue === 'out_of_stock' || llmValue === 'preorder') {
        // Penalty for no corroborating signal.
        return {
          value: llmValue,
          confidence: Math.max(0.3, AVAILABILITY_CONFIDENCE[llmValue] - 0.05),
          matched_pattern: pattern,
        };
      }
      return {
        value: 'unknown',
        confidence: AVAILABILITY_CONFIDENCE.unknown,
        matched_pattern: pattern,
      };
  }
}
