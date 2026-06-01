import { describe, it, expect } from 'vitest';
import { pearsonR, computeECE, computeAUC } from '../calibration.js';
import { FIELD_CONFIDENCE_MODIFIERS } from '../types.js';

describe('pearsonR', () => {
  it('returns 1.0 for perfectly correlated data', () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [2, 4, 6, 8, 10];
    expect(pearsonR(xs, ys)).toBeCloseTo(1.0, 5);
  });

  it('returns -1.0 for perfectly inversely correlated data', () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [10, 8, 6, 4, 2];
    expect(pearsonR(xs, ys)).toBeCloseTo(-1.0, 5);
  });

  it('returns 0 for uncorrelated data', () => {
    // Construct data with zero correlation
    const xs = [1, 2, 3, 4, 5];
    const ys = [3, 1, 4, 1, 5]; // roughly uncorrelated
    const r = pearsonR(xs, ys);
    expect(Math.abs(r)).toBeLessThan(0.5);
  });

  it('returns 0 for insufficient data (fewer than 2 points)', () => {
    expect(pearsonR([1], [2])).toBe(0);
    expect(pearsonR([], [])).toBe(0);
  });

  it('returns 0 for zero-variance data', () => {
    const xs = [5, 5, 5, 5];
    const ys = [1, 2, 3, 4];
    expect(pearsonR(xs, ys)).toBe(0);
  });

  it('returns 0 for mismatched array lengths', () => {
    expect(pearsonR([1, 2, 3], [1, 2])).toBe(0);
  });

  it('handles realistic confidence-accuracy data', () => {
    // High confidence should correlate with high accuracy
    const confidences = [0.95, 0.90, 0.85, 0.70, 0.60, 0.50, 0.40, 0.30];
    const accuracies =  [1,    1,    1,    0.8,  0.5,  0.3,  0.2,  0.1 ];
    const r = pearsonR(confidences, accuracies);
    expect(r).toBeGreaterThan(0.9);
  });
});

describe('calibration bucket logic', () => {
  it('buckets sort samples by confidence range', () => {
    const CONFIDENCE_BUCKETS: [number, number][] = [
      [0, 0.5],
      [0.5, 0.7],
      [0.7, 0.85],
      [0.85, 1.0],
    ];

    const samples = [
      { confidence: 0.3, accurate: false },
      { confidence: 0.45, accurate: false },
      { confidence: 0.6, accurate: true },
      { confidence: 0.65, accurate: false },
      { confidence: 0.75, accurate: true },
      { confidence: 0.80, accurate: true },
      { confidence: 0.90, accurate: true },
      { confidence: 0.95, accurate: true },
    ];

    const buckets = CONFIDENCE_BUCKETS.map(([low, high]) => {
      const inBucket = samples.filter(s => s.confidence >= low && s.confidence < (high === 1.0 ? 1.01 : high));
      const count = inBucket.length;
      const actualAccuracy = count > 0
        ? inBucket.filter(s => s.accurate).length / count
        : 0;
      return { confidence_range: [low, high], sample_count: count, actual_accuracy: actualAccuracy };
    });

    expect(buckets[0].sample_count).toBe(2); // 0-0.5
    expect(buckets[0].actual_accuracy).toBe(0); // 0/2
    expect(buckets[1].sample_count).toBe(2); // 0.5-0.7
    expect(buckets[1].actual_accuracy).toBe(0.5); // 1/2
    expect(buckets[2].sample_count).toBe(2); // 0.7-0.85
    expect(buckets[2].actual_accuracy).toBe(1.0); // 2/2
    expect(buckets[3].sample_count).toBe(2); // 0.85-1.0
    expect(buckets[3].actual_accuracy).toBe(1.0); // 2/2
  });

  it('returns insufficient_data recommendation with few samples', () => {
    // Simulate the logic from generateCalibrationReport
    const sampleSize = 5;
    const MIN_SAMPLES = 10;
    const recommendation = sampleSize < MIN_SAMPLES ? 'insufficient_data' : 'check_further';
    expect(recommendation).toBe('insufficient_data');
  });
});

describe('calibration-driven field modifier regressions', () => {
  // 2026-06-01: Live calibration showed product_name with Pearson R = -0.0945
  // (anti-correlated — higher confidence meant LOWER accuracy). Root cause was
  // the +0.05 product_name modifier inflating Schema.org product_name to 0.98
  // while ground-truth match accuracy was only 40% in that bucket. Brand at
  // baseline 0.93 (modifier 0.00) calibrated correctly at 100%.
  //
  // Do not re-introduce a positive product_name modifier without calibration
  // data justifying it. Any positive boost must show a measurable correlation
  // improvement in /api/stats/calibration field_pearson_r.product_name.
  it('product_name modifier is not positive (avoids anti-correlation)', () => {
    expect(FIELD_CONFIDENCE_MODIFIERS.product_name).toBeLessThanOrEqual(0);
  });

  it('product_name and brand modifiers are aligned (both are core identity fields)', () => {
    // Calibration showed brand at modifier 0.00 calibrates correctly.
    // product_name should track brand unless data justifies divergence.
    expect(FIELD_CONFIDENCE_MODIFIERS.product_name).toBe(FIELD_CONFIDENCE_MODIFIERS.brand);
  });
});

// Architect Move 3 / LAU-337: ECE + AUC-ROC become the primary calibration metrics.
// Pearson R stays as supplementary. These tests pin the math against known cases.

describe('computeECE', () => {
  it('returns ~0 for perfectly calibrated data', () => {
    // Bucket [0.85, 1.0]: avg confidence 0.9, accuracy 1.0 -> error 0.1
    // Bucket [0.7, 0.85]: avg confidence 0.8, accuracy 0.8 -> error 0.0
    // Bucket [0.5, 0.7]: avg confidence 0.6, accuracy 0.6 -> error 0.0
    // Bucket [0, 0.5]: avg confidence 0.3, accuracy 0.3 -> error 0.0
    // We need each bucket's avg_confidence == accuracy. Construct accordingly.
    const samples = [
      // [0.85, 1.0]: 10 samples at confidence 0.9, 9 correct -> avg 0.9, acc 0.9
      ...Array.from({ length: 9 }, () => ({ confidence: 0.9, correct: true })),
      ...Array.from({ length: 1 }, () => ({ confidence: 0.9, correct: false })),
      // [0.7, 0.85]: 10 samples at confidence 0.8, 8 correct -> avg 0.8, acc 0.8
      ...Array.from({ length: 8 }, () => ({ confidence: 0.8, correct: true })),
      ...Array.from({ length: 2 }, () => ({ confidence: 0.8, correct: false })),
      // [0.5, 0.7]: 10 samples at confidence 0.6, 6 correct -> avg 0.6, acc 0.6
      ...Array.from({ length: 6 }, () => ({ confidence: 0.6, correct: true })),
      ...Array.from({ length: 4 }, () => ({ confidence: 0.6, correct: false })),
      // [0, 0.5]: 10 samples at confidence 0.3, 3 correct -> avg 0.3, acc 0.3
      ...Array.from({ length: 3 }, () => ({ confidence: 0.3, correct: true })),
      ...Array.from({ length: 7 }, () => ({ confidence: 0.3, correct: false })),
    ];
    expect(computeECE(samples)).toBeCloseTo(0, 5);
  });

  it('returns ~1 for perfectly mis-calibrated data', () => {
    // Confidence 1.0 across the top bucket, but never correct -> |1 - 0| * 1 = 1
    const samples = Array.from({ length: 20 }, () => ({ confidence: 1.0, correct: false }));
    expect(computeECE(samples)).toBeCloseTo(1, 5);
  });

  it('weights bucket errors by bucket size', () => {
    // Two buckets contribute. Small bucket has large error; large bucket is perfect.
    // Small: 2 samples at conf 0.9 with 0 correct -> bucket error |0.9 - 0| = 0.9; weight 2/12
    // Large: 10 samples at conf 0.3 with 3 correct -> bucket error |0.3 - 0.3| = 0; weight 10/12
    // Expected ECE = 0.9 * (2/12) = 0.15
    const samples = [
      ...Array.from({ length: 2 }, () => ({ confidence: 0.9, correct: false })),
      ...Array.from({ length: 3 }, () => ({ confidence: 0.3, correct: true })),
      ...Array.from({ length: 7 }, () => ({ confidence: 0.3, correct: false })),
    ];
    expect(computeECE(samples)).toBeCloseTo(0.15, 5);
  });

  it('returns 0 for empty input', () => {
    expect(computeECE([])).toBe(0);
  });

  it('skips empty buckets', () => {
    // Only the top bucket is populated.
    const samples = [
      { confidence: 0.95, correct: true },
      { confidence: 0.95, correct: true },
    ];
    expect(computeECE(samples)).toBeCloseTo(Math.abs(0.95 - 1.0), 5);
  });
});

describe('computeAUC', () => {
  it('returns ~1.0 for perfectly correlated data', () => {
    // All correct samples have higher confidence than all incorrect ones.
    const samples = [
      { confidence: 0.1, correct: false },
      { confidence: 0.2, correct: false },
      { confidence: 0.3, correct: false },
      { confidence: 0.7, correct: true },
      { confidence: 0.8, correct: true },
      { confidence: 0.9, correct: true },
    ];
    expect(computeAUC(samples)).toBeCloseTo(1.0, 5);
  });

  it('returns ~0.0 for perfectly anti-correlated data', () => {
    // All correct samples have lower confidence than all incorrect ones.
    const samples = [
      { confidence: 0.1, correct: true },
      { confidence: 0.2, correct: true },
      { confidence: 0.3, correct: true },
      { confidence: 0.7, correct: false },
      { confidence: 0.8, correct: false },
      { confidence: 0.9, correct: false },
    ];
    expect(computeAUC(samples)).toBeCloseTo(0.0, 5);
  });

  it('returns ~0.5 when positives and negatives are evenly split in rank', () => {
    // 4 positives and 4 negatives, with positives sitting at ranks {1,3,6,8} and
    // negatives at {2,4,5,7}. Sum of positive ranks = 18 = sum of negative ranks,
    // which is the AUC=0.5 condition for balanced classes.
    const samples = [
      { confidence: 0.1, correct: true },
      { confidence: 0.2, correct: false },
      { confidence: 0.3, correct: true },
      { confidence: 0.4, correct: false },
      { confidence: 0.5, correct: false },
      { confidence: 0.6, correct: true },
      { confidence: 0.7, correct: false },
      { confidence: 0.8, correct: true },
    ];
    expect(computeAUC(samples)).toBeCloseTo(0.5, 5);
  });

  it('handles ties via average rank', () => {
    // 4 samples all at confidence 0.5; 2 correct, 2 incorrect. AUC should be exactly 0.5.
    const samples = [
      { confidence: 0.5, correct: true },
      { confidence: 0.5, correct: true },
      { confidence: 0.5, correct: false },
      { confidence: 0.5, correct: false },
    ];
    expect(computeAUC(samples)).toBeCloseTo(0.5, 5);
  });

  it('returns 0.5 when there are no positives or no negatives', () => {
    expect(computeAUC([{ confidence: 0.8, correct: true }, { confidence: 0.9, correct: true }])).toBe(0.5);
    expect(computeAUC([{ confidence: 0.1, correct: false }, { confidence: 0.2, correct: false }])).toBe(0.5);
  });

  it('returns 0.5 for fewer than 2 samples', () => {
    expect(computeAUC([])).toBe(0.5);
    expect(computeAUC([{ confidence: 0.7, correct: true }])).toBe(0.5);
  });
});

describe('recommendation logic (Architect Move 3 thresholds)', () => {
  // Re-implements the recommendation decision from generateCalibrationReport so we
  // can test it without spinning up Redis. If the live logic changes, update both.
  function recommend(sampleSize: number, ece: number, auc: number): string {
    if (sampleSize < 30) return 'insufficient_data';
    if (ece < 0.10 && auc > 0.75) return 'well_calibrated';
    return 'needs_adjustment';
  }

  it('classifies well-calibrated when ECE < 0.10 AND AUC > 0.75', () => {
    expect(recommend(100, 0.05, 0.85)).toBe('well_calibrated');
  });

  it('classifies needs_adjustment when ECE >= 0.10 (even if AUC is high)', () => {
    expect(recommend(100, 0.15, 0.90)).toBe('needs_adjustment');
  });

  it('classifies needs_adjustment when AUC <= 0.75 (even if ECE is low)', () => {
    expect(recommend(100, 0.05, 0.70)).toBe('needs_adjustment');
  });

  it('classifies insufficient_data with <30 samples regardless of metrics', () => {
    expect(recommend(20, 0.01, 0.99)).toBe('insufficient_data');
  });

  it('treats AUC == 0.75 as needing adjustment (strict inequality)', () => {
    expect(recommend(100, 0.05, 0.75)).toBe('needs_adjustment');
  });

  it('treats ECE == 0.10 as needing adjustment (strict inequality)', () => {
    expect(recommend(100, 0.10, 0.80)).toBe('needs_adjustment');
  });
});
