/**
 * Confidence calibration pipeline for ShopGraph.
 *
 * Analyzes stored extraction results to measure the correlation between
 * reported confidence scores and actual accuracy (via LLM validation
 * or ground truth matching). This is the proof that confidence scores
 * are meaningful, not just subjective numbers.
 */

import type { Redis } from '@upstash/redis';
import type { BatchResult } from './stats.js';

export interface CalibrationBucket {
  confidence_range: [number, number];
  sample_count: number;
  actual_accuracy: number;
  calibration_error: number; // predicted confidence - actual accuracy
}

export interface CalibrationReport {
  generated_at: string;
  sample_size: number;
  per_field: Record<string, CalibrationBucket[]>;
  overall_pearson_r: number;
  field_pearson_r: Record<string, number>;
  recommendation: string; // "well_calibrated" | "needs_adjustment" | "insufficient_data"
}

const CONFIDENCE_BUCKETS: [number, number][] = [
  [0, 0.5],
  [0.5, 0.7],
  [0.7, 0.85],
  [0.85, 1.0],
];

const MIN_SAMPLES_FOR_CALIBRATION = 10;

/**
 * Compute Pearson correlation coefficient between two arrays.
 * Returns 0 if insufficient data or zero variance.
 */
export function pearsonR(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2 || n !== ys.length) return 0;

  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denomX = 0;
  let denomY = 0;

  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  const denom = Math.sqrt(denomX * denomY);
  if (denom === 0) return 0;

  return numerator / denom;
}

interface FieldSample {
  confidence: number;
  accurate: boolean;
}

/**
 * Generate a calibration report from stored batch results in Redis.
 * Reads all results that have llm_validation or ground_truth_match data.
 */
export async function generateCalibrationReport(redis: Redis): Promise<CalibrationReport> {
  // Scan for result keys
  const resultKeys: string[] = [];
  let cursor = 0;
  do {
    const [nextCursor, keys] = await redis.scan(cursor, { match: 'results:*', count: 100 });
    cursor = typeof nextCursor === 'string' ? parseInt(nextCursor, 10) : nextCursor;
    resultKeys.push(...keys);
  } while (cursor !== 0);

  // Collect per-field samples: { confidence, accurate }
  const fieldSamples: Record<string, FieldSample[]> = {};
  const allConfidences: number[] = [];
  const allAccuracies: number[] = [];

  for (const key of resultKeys) {
    const result = await redis.get<BatchResult>(key);
    if (!result?.field_results) continue;

    const fr = result.field_results;

    // Use LLM validation data if available
    if (fr.llm_validation) {
      for (const [field, verified] of Object.entries(fr.llm_validation.fields_verified)) {
        const confidence = fr.per_field_confidence[field];
        if (confidence === undefined) continue;

        if (!fieldSamples[field]) fieldSamples[field] = [];
        const accurate = typeof verified === 'boolean' ? verified : false;
        fieldSamples[field].push({ confidence, accurate });
        allConfidences.push(confidence);
        allAccuracies.push(accurate ? 1 : 0);
      }
    }

    // Use ground truth data if available
    if (fr.ground_truth_match) {
      for (const [field, matched] of Object.entries(fr.ground_truth_match)) {
        const confidence = fr.per_field_confidence[field];
        if (confidence === undefined) continue;

        // Skip if we already have LLM validation for this field (avoid double-counting)
        if (fr.llm_validation?.fields_verified[field] !== undefined) continue;

        if (!fieldSamples[field]) fieldSamples[field] = [];
        fieldSamples[field].push({ confidence, accurate: matched });
        allConfidences.push(confidence);
        allAccuracies.push(matched ? 1 : 0);
      }
    }
  }

  const sampleSize = allConfidences.length;

  if (sampleSize < MIN_SAMPLES_FOR_CALIBRATION) {
    const report: CalibrationReport = {
      generated_at: new Date().toISOString(),
      sample_size: sampleSize,
      per_field: {},
      overall_pearson_r: 0,
      field_pearson_r: {},
      recommendation: 'insufficient_data',
    };
    await redis.set('stats:calibration', report);
    return report;
  }

  // Build per-field calibration buckets
  const perField: Record<string, CalibrationBucket[]> = {};
  const fieldPearsonR: Record<string, number> = {};

  for (const [field, samples] of Object.entries(fieldSamples)) {
    const buckets: CalibrationBucket[] = CONFIDENCE_BUCKETS.map(([low, high]) => {
      const inBucket = samples.filter(s => s.confidence >= low && s.confidence < (high === 1.0 ? 1.01 : high));
      const count = inBucket.length;
      const actualAccuracy = count > 0
        ? inBucket.filter(s => s.accurate).length / count
        : 0;
      const avgConfidence = count > 0
        ? inBucket.reduce((sum, s) => sum + s.confidence, 0) / count
        : (low + high) / 2;

      return {
        confidence_range: [low, high],
        sample_count: count,
        actual_accuracy: actualAccuracy,
        calibration_error: avgConfidence - actualAccuracy,
      };
    });

    perField[field] = buckets;

    // Per-field Pearson R
    const xs = samples.map(s => s.confidence);
    const ys = samples.map(s => s.accurate ? 1 : 0);
    fieldPearsonR[field] = pearsonR(xs, ys);
  }

  const overallR = pearsonR(allConfidences, allAccuracies);

  let recommendation: string;
  if (overallR > 0.70) {
    recommendation = 'well_calibrated';
  } else if (sampleSize < 30) {
    recommendation = 'insufficient_data';
  } else {
    recommendation = 'needs_adjustment';
  }

  const report: CalibrationReport = {
    generated_at: new Date().toISOString(),
    sample_size: sampleSize,
    per_field: perField,
    overall_pearson_r: overallR,
    field_pearson_r: fieldPearsonR,
    recommendation,
  };

  await redis.set('stats:calibration', report);
  return report;
}
