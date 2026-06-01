/**
 * Description quality heuristics — LAU-333.
 *
 * Extractors (Schema.org + LLM) frequently return descriptions that are
 * either truncated copy ("...", "see more", abrupt cutoffs at length caps)
 * or marketing fluff ("The perfect addition to any kitchen!") rather than
 * actual product information. The 2026-06-01 calibration showed description
 * Pearson R = -0.51 with a [0.85, 1.0] bucket accuracy of 50%.
 *
 * This module exposes pure-function classifiers used to penalize confidence
 * on emission. Deltas are intentionally small (-0.10 / -0.15) so that
 * extractor output lands in the 0.4-0.7 calibration band when both
 * heuristics fire on the same description.
 */

export interface TruncationResult {
  truncated: boolean;
  delta: number;
  reason: string | null;
}

export interface CopyClassification {
  classification: 'fluff' | 'spec' | 'mixed' | 'unknown';
  delta: number;
  reason: string | null;
}

/** Confidence drop applied to truncated descriptions. */
export const TRUNCATION_PENALTY = -0.10;

/** Confidence drop applied to marketing-fluff descriptions. */
export const FLUFF_PENALTY = -0.15;

/** Partial penalty for mixed (fluff + some spec signals) copy. */
export const MIXED_PENALTY = -0.05;

/**
 * Length cap above which we suspect extractor-driven truncation. Most
 * upstream extractors cap descriptions in the 200-300 char range; the
 * 280-char cap below catches the common 256-char / 280-char / 300-char
 * truncations without flagging legitimately short descriptions.
 */
export const TRUNCATION_LENGTH_CAP = 280;

/**
 * Regex for suffix-based truncation markers. Catches ASCII ellipsis,
 * Unicode ellipsis, "see more"/"read more"/"show more"/"view more",
 * and trailing "..." with optional trailing whitespace/punctuation.
 */
const TRUNCATION_SUFFIX_RE =
  /(\.{3,}|…|(see|read|show|view)\s+more|\.\.\.\s*$|continue\s+reading)\s*[.!?\s]*$/i;

/**
 * Detect whether a description appears truncated. Returns `truncated: true`
 * when EITHER of:
 *   - length >= TRUNCATION_LENGTH_CAP AND ends without sentence-final
 *     punctuation, OR
 *   - matches a truncation-suffix marker ("...", "see more", etc.).
 *
 * `delta` is TRUNCATION_PENALTY (-0.10) when truncated, 0 otherwise.
 */
export function detectTruncation(description: string | null | undefined): TruncationResult {
  if (!description || typeof description !== 'string') {
    return { truncated: false, delta: 0, reason: null };
  }
  const trimmed = description.trim();
  if (trimmed.length === 0) {
    return { truncated: false, delta: 0, reason: null };
  }

  // Suffix-based detection — works regardless of length.
  if (TRUNCATION_SUFFIX_RE.test(trimmed)) {
    return {
      truncated: true,
      delta: TRUNCATION_PENALTY,
      reason: 'Truncation marker detected (ellipsis or "see more" suffix)',
    };
  }

  // Length-based detection: a description hitting a typical extractor cap
  // (>= 280 chars) without ending in sentence-final punctuation is almost
  // certainly truncated mid-sentence.
  if (trimmed.length >= TRUNCATION_LENGTH_CAP) {
    const lastChar = trimmed[trimmed.length - 1];
    const sentenceFinal = lastChar === '.' || lastChar === '!' || lastChar === '?' || lastChar === '"' || lastChar === ')';
    if (!sentenceFinal) {
      return {
        truncated: true,
        delta: TRUNCATION_PENALTY,
        reason: `Length cap suspected (>= ${TRUNCATION_LENGTH_CAP} chars, no sentence-final punctuation)`,
      };
    }
  }

  return { truncated: false, delta: 0, reason: null };
}

/**
 * Marketing-fluff keyword phrases. These are catch-phrases that appear in
 * marketing copy but not in spec-bearing descriptions.
 */
const FLUFF_PHRASE_RE =
  /\b(perfect for|the ultimate|you'?ll love|experience the|transform your|elevate your|must[- ]have|the perfect|simply the best|game[- ]chang(er|ing)|life[- ]chang(er|ing)|next[- ]level|world[- ]class|state[- ]of[- ]the[- ]art|cutting[- ]edge|premium quality|unparalleled|second to none)\b/i;

/**
 * Spec-bearing signals: dimensions ("12in", "12 x 18 cm"), materials
 * (cotton, steel, ceramic, polyester, leather), capacity / volume
 * (oz, ml, lb, kg, gallons, cups, watts), model numbers / SKUs
 * (alphanumeric with hyphens or numbers >= 3 digits).
 */
const SPEC_PATTERNS: ReadonlyArray<RegExp> = [
  // Dimensions: "12 x 18", "12in", "12.5 cm", quoted-inches
  /\b\d+(\.\d+)?\s*(["']|in|inch(es)?|cm|mm|ft|feet|m\b)\b/i,
  /\b\d+(\.\d+)?\s*[x×]\s*\d+(\.\d+)?(\s*[x×]\s*\d+(\.\d+)?)?\b/i,
  // Materials
  /\b(cotton|polyester|wool|linen|silk|nylon|leather|suede|denim|cashmere|steel|aluminum|brass|copper|iron|titanium|ceramic|porcelain|glass|wood|bamboo|plastic|rubber|silicone|carbon\s*fib(er|re)|stainless\s*steel|cast\s*iron|tempered\s*glass)\b/i,
  // Capacity / volume / weight
  /\b\d+(\.\d+)?\s*(oz|ml|l\b|lb|kg|g\b|gal(lon)?s?|cup|qt|quart|pt|pint|watts?|volts?|amps?|hz)\b/i,
  // Model numbers / SKUs: alphanumeric with hyphen, or 3+ digit identifiers
  /\b(model|sku|part\s*(no\.?|number)?|item\s*(no\.?|number)?)\s*:?\s*[A-Z0-9][A-Z0-9-]{2,}\b/i,
  /\b[A-Z]{2,}-?\d{3,}[A-Z0-9-]*\b/,
  // B2B-specific spec phrases
  /\b(MOQ|lead\s*time|tier\s*pricing|bulk\s*pricing|volume\s*discount|minimum\s*order|wholesale)\b/i,
];

/** All-caps sentences (3+ consecutive uppercase words). */
const ALL_CAPS_RE = /\b[A-Z]{2,}(\s+[A-Z]{2,}){2,}\b/;

/** Excessive exclamation: 3+ marks anywhere. */
const EXCESSIVE_EXCLAIM_RE = /!.*!.*!/;

/**
 * Classify description copy as marketing fluff, spec-bearing, mixed, or
 * unknown. Approach:
 *   1. Detect fluff signals: phrase matches, all-caps sentences, 3+ "!".
 *   2. Detect spec signals: dimensions, materials, capacity, model numbers,
 *      B2B spec phrases (MOQ, lead time).
 *   3. Combine:
 *      - fluff signal(s) + no spec signal → 'fluff' (-0.15)
 *      - fluff signal(s) + some spec signal → 'mixed' (-0.05)
 *      - no fluff signal, has spec signal → 'spec' (0)
 *      - no fluff, no spec → 'unknown' (0; neutral, defers to baseline)
 *
 * Null / empty descriptions return classification 'unknown' with delta 0.
 */
export function classifyDescriptionCopy(
  description: string | null | undefined,
): CopyClassification {
  if (!description || typeof description !== 'string') {
    return { classification: 'unknown', delta: 0, reason: null };
  }
  const trimmed = description.trim();
  if (trimmed.length === 0) {
    return { classification: 'unknown', delta: 0, reason: null };
  }

  const fluffSignals: string[] = [];
  if (FLUFF_PHRASE_RE.test(trimmed)) fluffSignals.push('fluff phrase');
  if (ALL_CAPS_RE.test(trimmed)) fluffSignals.push('all-caps shouting');
  if (EXCESSIVE_EXCLAIM_RE.test(trimmed)) fluffSignals.push('excessive exclamation marks');

  let specCount = 0;
  for (const pat of SPEC_PATTERNS) {
    if (pat.test(trimmed)) specCount += 1;
  }

  const hasFluff = fluffSignals.length > 0;
  const hasSpec = specCount > 0;

  if (hasFluff && !hasSpec) {
    return {
      classification: 'fluff',
      delta: FLUFF_PENALTY,
      reason: `Marketing fluff detected (${fluffSignals.join(', ')}); no spec-bearing signals`,
    };
  }

  if (hasFluff && hasSpec) {
    return {
      classification: 'mixed',
      delta: MIXED_PENALTY,
      reason: `Mixed copy: marketing fluff (${fluffSignals.join(', ')}) + ${specCount} spec signal(s)`,
    };
  }

  if (!hasFluff && hasSpec) {
    return {
      classification: 'spec',
      delta: 0,
      reason: `Spec-bearing description (${specCount} spec signal(s))`,
    };
  }

  return {
    classification: 'unknown',
    delta: 0,
    reason: null,
  };
}
