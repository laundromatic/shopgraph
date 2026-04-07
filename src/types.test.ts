import { describe, it, expect } from 'vitest';
import {
  TOOL_PRICING,
  SCHEMA_ORG_BASELINE,
  LLM_BASE_BASELINE,
  LLM_LOW_BASELINE,
  LLM_BOOSTED_BASELINE,
  FIELD_CONFIDENCE_MODIFIERS,
  getFieldConfidence,
} from './types.js';

describe('types', () => {
  it('has correct tool pricing', () => {
    expect(TOOL_PRICING.enrich_product).toBe(2);
    expect(TOOL_PRICING.enrich_basic).toBe(1);
  });
});

describe('getFieldConfidence', () => {
  it('applies known field modifier', () => {
    // product_name has +0.05 modifier
    expect(getFieldConfidence(SCHEMA_ORG_BASELINE, 'product_name')).toBeCloseTo(0.98, 10);
    // availability has -0.10 modifier
    expect(getFieldConfidence(SCHEMA_ORG_BASELINE, 'availability')).toBeCloseTo(0.83, 10);
  });

  it('returns baseline for unknown fields', () => {
    expect(getFieldConfidence(0.7, 'unknown_field')).toBe(0.7);
  });

  it('clamps to [0, 1]', () => {
    // High baseline + positive modifier should not exceed 1
    expect(getFieldConfidence(0.99, 'product_name')).toBe(1.0);
    // Low baseline + negative modifier should not go below 0
    expect(getFieldConfidence(0.05, 'availability')).toBe(0);
  });

  it('works with LLM baselines', () => {
    expect(getFieldConfidence(LLM_BASE_BASELINE, 'brand')).toBeCloseTo(0.70, 10);
    expect(getFieldConfidence(LLM_BOOSTED_BASELINE, 'price')).toBeCloseTo(0.85, 10);
    expect(getFieldConfidence(LLM_LOW_BASELINE, 'description')).toBeCloseTo(0.55, 10);
  });
});
