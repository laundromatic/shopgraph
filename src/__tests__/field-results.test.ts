import { describe, it, expect } from 'vitest';
import { buildFieldResults, aggregateFieldAndSegmentStats } from '../test-runner.js';
import type { ProductData, CorpusEntry } from '../types.js';
import type { BatchResult } from '../stats.js';

function makeProduct(overrides: Partial<ProductData> = {}): ProductData {
  return {
    url: 'https://example.com/product',
    extracted_at: '2026-04-07T00:00:00Z',
    extraction_method: 'schema_org',
    product_name: 'Test Widget',
    brand: 'Acme',
    description: 'A fine widget',
    price: { amount: 29.99, currency: 'USD' },
    availability: 'in_stock',
    categories: ['Widgets'],
    image_urls: ['https://example.com/img.jpg'],
    primary_image_url: 'https://example.com/img.jpg',
    color: ['red'],
    material: ['plastic'],
    dimensions: { width: '10cm' },
    schema_org_raw: null,
    confidence: { overall: 0.9, per_field: { product_name: 0.95, brand: 0.85, price: 0.9 } },
    ...overrides,
  };
}

function makeEntry(overrides: Partial<CorpusEntry> = {}): CorpusEntry {
  return {
    url: 'https://example.com/product',
    vertical: 'Electronics',
    added: '2026-04-01',
    ...overrides,
  };
}

describe('buildFieldResults', () => {
  it('identifies all extracted fields for a fully populated product', () => {
    const product = makeProduct();
    const entry = makeEntry();
    const result = buildFieldResults(product, entry);

    expect(result.fields_extracted).toContain('product_name');
    expect(result.fields_extracted).toContain('brand');
    expect(result.fields_extracted).toContain('description');
    expect(result.fields_extracted).toContain('price');
    expect(result.fields_extracted).toContain('availability');
    expect(result.fields_extracted).toContain('categories');
    expect(result.fields_extracted).toContain('color');
    expect(result.fields_extracted).toContain('material');
    expect(result.fields_extracted).toContain('dimensions');
    expect(result.fields_total).toBe(9);
    expect(result.field_completeness).toBe(1);
  });

  it('excludes null fields from extracted list', () => {
    const product = makeProduct({ brand: null, description: null });
    const entry = makeEntry();
    const result = buildFieldResults(product, entry);

    expect(result.fields_extracted).not.toContain('brand');
    expect(result.fields_extracted).not.toContain('description');
    expect(result.field_completeness).toBeCloseTo(7 / 9);
  });

  it('excludes empty arrays from extracted list', () => {
    const product = makeProduct({ categories: [], color: [], material: [] });
    const entry = makeEntry();
    const result = buildFieldResults(product, entry);

    expect(result.fields_extracted).not.toContain('categories');
    expect(result.fields_extracted).not.toContain('color');
    expect(result.fields_extracted).not.toContain('material');
  });

  it('excludes "unknown" availability from extracted list', () => {
    const product = makeProduct({ availability: 'unknown' });
    const entry = makeEntry();
    const result = buildFieldResults(product, entry);

    expect(result.fields_extracted).not.toContain('availability');
  });

  it('copies per_field_confidence from product', () => {
    const product = makeProduct();
    const entry = makeEntry();
    const result = buildFieldResults(product, entry);

    expect(result.per_field_confidence).toEqual({ product_name: 0.95, brand: 0.85, price: 0.9 });
  });

  it('returns empty per_field_confidence when confidence missing', () => {
    const product = makeProduct({ confidence: { overall: 0.5, per_field: {} } });
    const entry = makeEntry();
    const result = buildFieldResults(product, entry);

    expect(result.per_field_confidence).toEqual({});
  });

  it('has no ground_truth_match when entry has no ground_truth', () => {
    const product = makeProduct();
    const entry = makeEntry();
    const result = buildFieldResults(product, entry);

    expect(result.ground_truth_match).toBeUndefined();
    expect(result.accuracy_score).toBeUndefined();
  });
});

describe('ground truth comparison', () => {
  it('matches product_name with case-insensitive substring', () => {
    const product = makeProduct({ product_name: 'Acme Test Widget Pro' });
    const entry = makeEntry({ ground_truth: { product_name: 'test widget' } });
    const result = buildFieldResults(product, entry);

    expect(result.ground_truth_match?.product_name).toBe(true);
  });

  it('fails product_name match when not a substring', () => {
    const product = makeProduct({ product_name: 'Different Product' });
    const entry = makeEntry({ ground_truth: { product_name: 'test widget' } });
    const result = buildFieldResults(product, entry);

    expect(result.ground_truth_match?.product_name).toBe(false);
  });

  it('matches brand with exact case-insensitive comparison', () => {
    const product = makeProduct({ brand: 'ACME' });
    const entry = makeEntry({ ground_truth: { brand: 'acme' } });
    const result = buildFieldResults(product, entry);

    expect(result.ground_truth_match?.brand).toBe(true);
  });

  it('fails brand match when not exact', () => {
    const product = makeProduct({ brand: 'Acme Corp' });
    const entry = makeEntry({ ground_truth: { brand: 'acme' } });
    const result = buildFieldResults(product, entry);

    expect(result.ground_truth_match?.brand).toBe(false);
  });

  it('matches price within 1% tolerance', () => {
    const product = makeProduct({ price: { amount: 30.09, currency: 'USD' } });
    const entry = makeEntry({ ground_truth: { price_amount: 29.99 } });
    const result = buildFieldResults(product, entry);

    // Diff is 0.10 / 29.99 = 0.0033 < 0.01 => match
    expect(result.ground_truth_match?.price).toBe(true);
  });

  it('fails price match outside 1% tolerance', () => {
    const product = makeProduct({ price: { amount: 31.00, currency: 'USD' } });
    const entry = makeEntry({ ground_truth: { price_amount: 29.99 } });
    const result = buildFieldResults(product, entry);

    // Diff is 1.01 / 29.99 = 0.0337 > 0.01 => no match
    expect(result.ground_truth_match?.price).toBe(false);
  });

  it('matches currency exactly', () => {
    const product = makeProduct({ price: { amount: 29.99, currency: 'USD' } });
    const entry = makeEntry({ ground_truth: { price_currency: 'USD' } });
    const result = buildFieldResults(product, entry);

    expect(result.ground_truth_match?.currency).toBe(true);
  });

  it('fails currency when different', () => {
    const product = makeProduct({ price: { amount: 29.99, currency: 'EUR' } });
    const entry = makeEntry({ ground_truth: { price_currency: 'USD' } });
    const result = buildFieldResults(product, entry);

    expect(result.ground_truth_match?.currency).toBe(false);
  });

  it('matches availability exactly', () => {
    const product = makeProduct({ availability: 'in_stock' });
    const entry = makeEntry({ ground_truth: { availability: 'in_stock' } });
    const result = buildFieldResults(product, entry);

    expect(result.ground_truth_match?.availability).toBe(true);
  });

  it('computes accuracy_score as ratio of matches', () => {
    const product = makeProduct({ product_name: 'Test Widget', brand: 'Wrong Brand' });
    const entry = makeEntry({
      ground_truth: { product_name: 'Test Widget', brand: 'Acme' },
    });
    const result = buildFieldResults(product, entry);

    // product_name: true (substring), brand: false (exact mismatch)
    expect(result.accuracy_score).toBe(0.5);
  });

  it('handles null product fields gracefully in ground truth comparison', () => {
    const product = makeProduct({ product_name: null, brand: null, price: null });
    const entry = makeEntry({
      ground_truth: { product_name: 'Widget', brand: 'Acme', price_amount: 10 },
    });
    const result = buildFieldResults(product, entry);

    expect(result.ground_truth_match?.product_name).toBe(false);
    expect(result.ground_truth_match?.brand).toBe(false);
    expect(result.ground_truth_match?.price).toBe(false);
    expect(result.accuracy_score).toBe(0);
  });
});

describe('cross_signal_agreement and llm_validation fields', () => {
  it('stores cross_signal_agreement on FieldResults', () => {
    const product = makeProduct();
    const entry = makeEntry();
    const result = buildFieldResults(product, entry);

    // Before setting, field should be undefined
    expect(result.cross_signal_agreement).toBeUndefined();

    // Simulate setting it
    result.cross_signal_agreement = { product_name: true, price: true, availability: false };
    expect(result.cross_signal_agreement.product_name).toBe(true);
    expect(result.cross_signal_agreement.availability).toBe(false);
  });

  it('stores llm_validation on FieldResults', () => {
    const product = makeProduct();
    const entry = makeEntry();
    const result = buildFieldResults(product, entry);

    // Before setting, field should be undefined
    expect(result.llm_validation).toBeUndefined();

    // Simulate setting it
    result.llm_validation = {
      fields_verified: { product_name: true, brand: true, price_amount: false },
      overall_accuracy: 0.67,
      duration_ms: 1500,
    };
    expect(result.llm_validation.overall_accuracy).toBeCloseTo(0.67);
    expect(result.llm_validation.fields_verified.product_name).toBe(true);
    expect(result.llm_validation.fields_verified.price_amount).toBe(false);
    expect(result.llm_validation.duration_ms).toBe(1500);
  });

  it('aggregateFieldAndSegmentStats handles results with llm_validation', () => {
    const results: BatchResult[] = [
      {
        url: 'https://example.com/p',
        vertical: 'Electronics',
        success: true,
        confidence: 0.85,
        extraction_method: 'schema_org',
        product_name: 'Widget',
        error: null,
        duration_ms: 500,
        field_results: {
          fields_extracted: ['product_name', 'brand'],
          fields_total: 9,
          field_completeness: 2 / 9,
          per_field_confidence: { product_name: 0.9, brand: 0.8 },
          llm_validation: {
            fields_verified: { product_name: true, brand: false },
            overall_accuracy: 0.5,
            duration_ms: 1200,
          },
        },
      },
    ];

    // Should not throw
    const { fieldStats } = aggregateFieldAndSegmentStats(results);
    expect(fieldStats.find(f => f.field_name === 'product_name')?.extraction_rate).toBe(1);
  });

  it('aggregateFieldAndSegmentStats handles results with cross_signal_agreement', () => {
    const results: BatchResult[] = [
      {
        url: 'https://example.com/p',
        vertical: 'Electronics',
        success: true,
        confidence: 0.85,
        extraction_method: 'schema_org',
        product_name: 'Widget',
        error: null,
        duration_ms: 500,
        field_results: {
          fields_extracted: ['product_name'],
          fields_total: 9,
          field_completeness: 1 / 9,
          per_field_confidence: { product_name: 0.9 },
          cross_signal_agreement: { product_name: true },
        },
      },
    ];

    // Should not throw
    const { fieldStats } = aggregateFieldAndSegmentStats(results);
    expect(fieldStats).toBeDefined();
  });
});

describe('aggregateFieldAndSegmentStats', () => {
  function makeBatchResult(overrides: Partial<BatchResult> = {}): BatchResult {
    return {
      url: 'https://example.com/p',
      vertical: 'Electronics',
      success: true,
      confidence: 0.85,
      extraction_method: 'schema_org',
      product_name: 'Widget',
      error: null,
      duration_ms: 500,
      ...overrides,
    };
  }

  it('calculates per-field extraction rates', () => {
    const results: BatchResult[] = [
      makeBatchResult({
        field_results: {
          fields_extracted: ['product_name', 'brand', 'price'],
          fields_total: 9,
          field_completeness: 3 / 9,
          per_field_confidence: { product_name: 0.9, brand: 0.8 },
        },
      }),
      makeBatchResult({
        field_results: {
          fields_extracted: ['product_name', 'description'],
          fields_total: 9,
          field_completeness: 2 / 9,
          per_field_confidence: { product_name: 0.95 },
        },
      }),
    ];

    const { fieldStats } = aggregateFieldAndSegmentStats(results);
    const nameField = fieldStats.find(f => f.field_name === 'product_name');
    const brandField = fieldStats.find(f => f.field_name === 'brand');
    const priceField = fieldStats.find(f => f.field_name === 'price');
    const descField = fieldStats.find(f => f.field_name === 'description');

    expect(nameField?.extraction_rate).toBe(1); // 2/2
    expect(brandField?.extraction_rate).toBe(0.5); // 1/2
    expect(priceField?.extraction_rate).toBe(0.5); // 1/2
    expect(descField?.extraction_rate).toBe(0.5); // 1/2
  });

  it('calculates segment breakdown', () => {
    const results: BatchResult[] = [
      makeBatchResult({ segment: 'b2b', success: true, confidence: 0.9 }),
      makeBatchResult({ segment: 'b2b', success: false, confidence: 0.3 }),
      makeBatchResult({ segment: 'b2c', success: true, confidence: 0.8 }),
    ];

    const { segmentStats } = aggregateFieldAndSegmentStats(results);

    expect(segmentStats.b2b.tested).toBe(2);
    expect(segmentStats.b2b.success_rate).toBe(0.5);
    expect(segmentStats.b2b.avg_confidence).toBe(0.6);
    expect(segmentStats.b2c.tested).toBe(1);
    expect(segmentStats.b2c.success_rate).toBe(1);
    expect(segmentStats.b2c.avg_confidence).toBe(0.8);
  });

  it('handles results with no segment gracefully', () => {
    const results: BatchResult[] = [
      makeBatchResult({ segment: undefined }),
    ];

    const { segmentStats } = aggregateFieldAndSegmentStats(results);
    expect(segmentStats.b2b.tested).toBe(0);
    expect(segmentStats.b2c.tested).toBe(0);
  });

  it('calculates accuracy stats from ground truth entries', () => {
    const results: BatchResult[] = [
      makeBatchResult({
        field_results: {
          fields_extracted: ['product_name'],
          fields_total: 9,
          field_completeness: 1 / 9,
          per_field_confidence: {},
          ground_truth_match: { product_name: true, brand: true },
          accuracy_score: 1.0,
        },
      }),
      makeBatchResult({
        field_results: {
          fields_extracted: ['product_name'],
          fields_total: 9,
          field_completeness: 1 / 9,
          per_field_confidence: {},
          ground_truth_match: { product_name: true, brand: false },
          accuracy_score: 0.5,
        },
      }),
      makeBatchResult({
        // No ground truth
        field_results: {
          fields_extracted: ['product_name'],
          fields_total: 9,
          field_completeness: 1 / 9,
          per_field_confidence: {},
        },
      }),
    ];

    const { accuracyStats } = aggregateFieldAndSegmentStats(results);
    expect(accuracyStats.entries_with_ground_truth).toBe(2);
    expect(accuracyStats.avg_accuracy).toBe(0.75);
  });

  it('returns zero accuracy when no ground truth entries', () => {
    const results: BatchResult[] = [makeBatchResult()];
    const { accuracyStats } = aggregateFieldAndSegmentStats(results);
    expect(accuracyStats.entries_with_ground_truth).toBe(0);
    expect(accuracyStats.avg_accuracy).toBe(0);
  });
});
