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

/** Confidence drop applied to truncated descriptions. */
export const TRUNCATION_PENALTY = -0.10;

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
