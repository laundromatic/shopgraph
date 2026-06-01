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
  // Primary metrics (Architect Move 3 / LAU-337):
  //   ECE measures probabilistic calibration. Lower is better; 0 = perfectly calibrated.
  //   AUC-ROC measures rank-discrimination. Higher is better; 0.5 = random, 1.0 = perfect.
  overall_ece: number;
  overall_auc: number;
  field_ece: Record<string, number>;
  field_auc: Record<string, number>;
  // Supplementary metric, retained for historical comparison:
  //   Pearson R is invariant under additive shifts on discrete-bucket confidence,
  //   so it's no longer load-bearing for the recommendation. Kept so we can
  //   diff against pre-Move-3 reports.
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

/**
 * Compute Expected Calibration Error (ECE).
 *
 * Buckets samples by confidence, then for each non-empty bucket computes
 *   |avg_confidence_in_bucket - accuracy_in_bucket| * (bucket_size / total)
 * and sums across buckets. Range [0, 1]; 0 = perfectly calibrated.
 *
 * This is the standard ECE formulation (Guo et al. 2017). Unlike Pearson R,
 * ECE is sensitive to additive shifts in confidence, which is what we need
 * when tuning per-field modifiers.
 *
 * Uses the same bucket boundaries as the per-field calibration buckets so the
 * report is internally consistent.
 */
export function computeECE(
  samples: Array<{ confidence: number; correct: boolean }>,
  buckets: [number, number][] = CONFIDENCE_BUCKETS,
): number {
  const n = samples.length;
  if (n === 0) return 0;

  let ece = 0;
  for (const [low, high] of buckets) {
    const upper = high === 1.0 ? 1.01 : high;
    const inBucket = samples.filter(s => s.confidence >= low && s.confidence < upper);
    const count = inBucket.length;
    if (count === 0) continue;

    const avgConfidence = inBucket.reduce((sum, s) => sum + s.confidence, 0) / count;
    const accuracy = inBucket.filter(s => s.correct).length / count;
    ece += Math.abs(avgConfidence - accuracy) * (count / n);
  }

  return ece;
}

/**
 * Compute AUC-ROC via the rank-sum formula (equivalent to trapezoidal ROC
 * integration but numerically stable and tie-aware):
 *
 *   AUC = (sum_of_ranks_of_positives - n_pos * (n_pos + 1) / 2) / (n_pos * n_neg)
 *
 * Ties contribute their average rank (standard Mann-Whitney U convention),
 * which is what makes discrete-bucket confidence scores behave sensibly.
 *
 * Range [0, 1]; 0.5 = random, 1.0 = perfect, < 0.5 = worse than random.
 * Returns 0.5 if there are no positives or no negatives (undefined otherwise).
 */
export function computeAUC(
  samples: Array<{ confidence: number; correct: boolean }>,
): number {
  const n = samples.length;
  if (n < 2) return 0.5;

  const nPos = samples.filter(s => s.correct).length;
  const nNeg = n - nPos;
  if (nPos === 0 || nNeg === 0) return 0.5;

  // Sort ascending by confidence so highest confidence gets the highest rank.
  const sorted = samples
    .map((s, i) => ({ ...s, originalIndex: i }))
    .sort((a, b) => a.confidence - b.confidence);

  // Assign average ranks (1-indexed) to handle ties.
  const ranks: number[] = new Array(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && sorted[j + 1].confidence === sorted[i].confidence) j++;
    // Tied group covers indices i..j inclusive; ranks (i+1)..(j+1).
    const avgRank = (i + 1 + j + 1) / 2;
    for (let k = i; k <= j; k++) ranks[k] = avgRank;
    i = j + 1;
  }

  let sumRanksPos = 0;
  for (let k = 0; k < n; k++) {
    if (sorted[k].correct) sumRanksPos += ranks[k];
  }

  return (sumRanksPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
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
      overall_ece: 0,
      overall_auc: 0.5,
      field_ece: {},
      field_auc: {},
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
  const fieldECE: Record<string, number> = {};
  const fieldAUC: Record<string, number> = {};

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

    // Per-field metrics. ECE + AUC use the {confidence, correct} shape, so
    // adapt the FieldSample shape (which uses `accurate`) here.
    const adapted = samples.map(s => ({ confidence: s.confidence, correct: s.accurate }));
    fieldECE[field] = computeECE(adapted);
    fieldAUC[field] = computeAUC(adapted);

    // Per-field Pearson R (supplementary — see CalibrationReport JSDoc).
    const xs = samples.map(s => s.confidence);
    const ys = samples.map(s => s.accurate ? 1 : 0);
    fieldPearsonR[field] = pearsonR(xs, ys);
  }

  // Overall metrics across all fields. Use the same adapted shape as per-field.
  const overallSamples = allConfidences.map((confidence, idx) => ({
    confidence,
    correct: allAccuracies[idx] === 1,
  }));
  const overallECE = computeECE(overallSamples);
  const overallAUC = computeAUC(overallSamples);
  const overallR = pearsonR(allConfidences, allAccuracies);

  // Recommendation logic (Architect Move 3 / LAU-337):
  //   well_calibrated:    ECE < 0.10 AND AUC > 0.75
  //   needs_adjustment:   ECE >= 0.10 OR  AUC <= 0.75 (with enough samples)
  //   insufficient_data:  <30 samples, even if metrics look fine
  let recommendation: string;
  if (sampleSize < 30) {
    recommendation = 'insufficient_data';
  } else if (overallECE < 0.10 && overallAUC > 0.75) {
    recommendation = 'well_calibrated';
  } else {
    recommendation = 'needs_adjustment';
  }

  const report: CalibrationReport = {
    generated_at: new Date().toISOString(),
    sample_size: sampleSize,
    per_field: perField,
    overall_ece: overallECE,
    overall_auc: overallAUC,
    field_ece: fieldECE,
    field_auc: fieldAUC,
    overall_pearson_r: overallR,
    field_pearson_r: fieldPearsonR,
    recommendation,
  };

  await redis.set('stats:calibration', report);
  return report;
}
