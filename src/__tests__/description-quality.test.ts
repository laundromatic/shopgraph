import { describe, it, expect } from 'vitest';
import {
  detectTruncation,
  classifyDescriptionCopy,
  TRUNCATION_PENALTY,
  TRUNCATION_LENGTH_CAP,
  FLUFF_PENALTY,
  MIXED_PENALTY,
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

describe('classifyDescriptionCopy', () => {
  it('returns unknown for null / empty input', () => {
    expect(classifyDescriptionCopy(null)).toEqual({ classification: 'unknown', delta: 0, reason: null });
    expect(classifyDescriptionCopy('')).toEqual({ classification: 'unknown', delta: 0, reason: null });
    expect(classifyDescriptionCopy('   ')).toEqual({ classification: 'unknown', delta: 0, reason: null });
  });

  it('classifies clearly marketing copy as fluff', () => {
    const fluff =
      "The perfect addition to any kitchen! You'll love how this transforms your morning. " +
      'A must-have for every home!!!';
    const result = classifyDescriptionCopy(fluff);
    expect(result.classification).toBe('fluff');
    expect(result.delta).toBe(FLUFF_PENALTY);
    expect(result.reason).toMatch(/fluff/i);
  });

  it('classifies clearly spec-bearing copy as spec', () => {
    const spec =
      'Stainless steel travel mug. 16 oz capacity. 7" tall x 3" wide. ' +
      'Vacuum-insulated. Model: TM-1600. Dishwasher safe.';
    const result = classifyDescriptionCopy(spec);
    expect(result.classification).toBe('spec');
    expect(result.delta).toBe(0);
    expect(result.reason).toMatch(/spec/i);
  });

  it('classifies copy with both fluff phrases and spec signals as mixed', () => {
    const mixed =
      "Perfect for outdoor adventures! Made of premium ripstop nylon. " +
      "Dimensions: 12 x 18 x 6 inches. You'll love it!";
    const result = classifyDescriptionCopy(mixed);
    expect(result.classification).toBe('mixed');
    expect(result.delta).toBe(MIXED_PENALTY);
    expect(result.reason).toMatch(/mixed/i);
  });

  it('returns unknown (neutral) for plain copy without fluff or spec signals', () => {
    const plain = 'A blue notebook.';
    const result = classifyDescriptionCopy(plain);
    expect(result.classification).toBe('unknown');
    expect(result.delta).toBe(0);
  });

  it('detects all-caps shouting as fluff signal', () => {
    const shouting = 'BUY NOW ACT FAST LIMITED TIME shop today';
    const result = classifyDescriptionCopy(shouting);
    expect(result.classification).toBe('fluff');
  });

  it('detects excessive exclamation as fluff signal', () => {
    const yelling = 'great product! amazing! best ever! you need this!';
    const result = classifyDescriptionCopy(yelling);
    expect(result.classification).toBe('fluff');
  });

  it('recognizes B2B spec phrases (MOQ, lead time) as spec signals', () => {
    const b2b = 'Industrial pump. MOQ: 50 units. Lead time: 3 weeks. Volume discount available.';
    const result = classifyDescriptionCopy(b2b);
    expect(result.classification).toBe('spec');
  });
});
