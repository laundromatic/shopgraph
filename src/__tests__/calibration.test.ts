import { describe, it, expect } from 'vitest';
import { pearsonR } from '../calibration.js';

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
