import { describe, it, expect } from 'vitest';
import {
  detectTruncation,
  TRUNCATION_PENALTY,
  TRUNCATION_LENGTH_CAP,
} from '../description-quality.js';

describe('detectTruncation', () => {
  it('returns not truncated for null / empty / non-string input', () => {
    expect(detectTruncation(null)).toEqual({ truncated: false, delta: 0, reason: null });
    expect(detectTruncation(undefined)).toEqual({ truncated: false, delta: 0, reason: null });
    expect(detectTruncation('')).toEqual({ truncated: false, delta: 0, reason: null });
    expect(detectTruncation('   ')).toEqual({ truncated: false, delta: 0, reason: null });
  });

  it('flags clearly truncated descriptions (ellipsis suffix)', () => {
    const result = detectTruncation(
      'This is a long product description that gets cut off mid-sentence...',
    );
    expect(result.truncated).toBe(true);
    expect(result.delta).toBe(TRUNCATION_PENALTY);
    expect(result.reason).toMatch(/truncation marker/i);
  });

  it('flags "see more" / "read more" suffixes', () => {
    expect(detectTruncation('Short product blurb see more').truncated).toBe(true);
    expect(detectTruncation('Long copy here read more').truncated).toBe(true);
    expect(detectTruncation('Snippet... view more').truncated).toBe(true);
  });

  it('flags Unicode ellipsis', () => {
    expect(detectTruncation('Mid-sentence cutoff…').truncated).toBe(true);
  });

  it('flags length-based truncation (>= 280 chars, no sentence-final punctuation)', () => {
    // 290-char description ending mid-word
    const longNoPeriod = 'x'.repeat(290) + ' some words ending mid sentence';
    const result = detectTruncation(longNoPeriod);
    expect(result.truncated).toBe(true);
    expect(result.delta).toBe(TRUNCATION_PENALTY);
    expect(result.reason).toMatch(/length cap/i);
  });

  it('does NOT flag borderline-length descriptions ending in proper punctuation', () => {
    // 290 chars ending with "."
    const longWithPeriod = 'a'.repeat(290) + '.';
    expect(detectTruncation(longWithPeriod).truncated).toBe(false);
  });

  it('does NOT flag short, complete descriptions', () => {
    const complete =
      'Premium cotton t-shirt with crew neck. Available in 5 colors. Machine washable.';
    expect(detectTruncation(complete).truncated).toBe(false);
  });

  it('cap constant is exposed and reasonable', () => {
    expect(TRUNCATION_LENGTH_CAP).toBe(280);
  });
});
