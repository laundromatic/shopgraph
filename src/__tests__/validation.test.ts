import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProductData } from '../types.js';

// Mock the Google Generative AI module
const mockGenerateContent = vi.fn();
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: () => ({
      generateContent: mockGenerateContent,
    }),
  })),
}));

// Set API key before imports
process.env.GOOGLE_API_KEY = 'test-key';

import { validateExtraction } from '../llm-extract.js';
import type { ValidationResult } from '../llm-extract.js';

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
    image_urls: [],
    primary_image_url: null,
    color: [],
    material: [],
    dimensions: null,
    schema_org_raw: null,
    confidence: { overall: 0.9, per_field: {} },
    ...overrides,
  };
}

const sampleHtml = `
<html>
<head><title>Test Widget - Acme</title></head>
<body>
  <h1>Test Widget</h1>
  <p>Brand: Acme</p>
  <p>Price: $29.99</p>
  <p>A fine widget</p>
  <p>In Stock</p>
</body>
</html>`;

describe('validateExtraction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns validation result with all fields verified', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => JSON.stringify({
          fields: {
            product_name: { correct: true, confidence: 0.95 },
            brand: { correct: true, confidence: 0.90 },
            description: { correct: true, confidence: 0.85 },
            price_amount: { correct: true, confidence: 0.92 },
            price_currency: { correct: true, confidence: 0.95 },
            availability: { correct: true, confidence: 0.88 },
          },
        }),
      },
    });

    const product = makeProduct();
    const result = await validateExtraction(product, sampleHtml);

    expect(result.validator_model).toBe('gemini-2.5-flash');
    expect(result.overall_accuracy).toBe(1.0);
    expect(result.fields_verified.product_name.correct).toBe(true);
    expect(result.fields_verified.brand.correct).toBe(true);
    expect(result.fields_verified.price_amount.correct).toBe(true);
    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('handles incorrect fields with corrections', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => JSON.stringify({
          fields: {
            product_name: { correct: true, confidence: 0.95 },
            brand: { correct: false, confidence: 0.80, correction: 'Acme Corp' },
            price_amount: { correct: false, confidence: 0.70, correction: '39.99' },
          },
        }),
      },
    });

    const product = makeProduct();
    const result = await validateExtraction(product, sampleHtml);

    expect(result.overall_accuracy).toBeCloseTo(1 / 3);
    expect(result.fields_verified.brand.correct).toBe(false);
    expect(result.fields_verified.brand.correction).toBe('Acme Corp');
    expect(result.fields_verified.price_amount.correct).toBe(false);
    expect(result.fields_verified.price_amount.correction).toBe('39.99');
  });

  it('handles JSON parse failure gracefully', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => 'not valid json at all',
      },
    });

    const product = makeProduct();
    const result = await validateExtraction(product, sampleHtml);

    expect(result.fields_verified).toEqual({});
    expect(result.overall_accuracy).toBe(0);
    expect(result.validator_model).toBe('gemini-2.5-flash');
  });

  it('handles markdown-wrapped JSON response', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => '```json\n' + JSON.stringify({
          fields: {
            product_name: { correct: true, confidence: 0.95 },
          },
        }) + '\n```',
      },
    });

    const product = makeProduct();
    const result = await validateExtraction(product, sampleHtml);

    expect(result.fields_verified.product_name.correct).toBe(true);
    expect(result.overall_accuracy).toBe(1.0);
  });

  it('skips null fields in the prompt', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => JSON.stringify({
          fields: {
            product_name: { correct: true, confidence: 0.95 },
          },
        }),
      },
    });

    const product = makeProduct({
      brand: null,
      description: null,
      price: null,
      availability: 'unknown',
    });
    const result = await validateExtraction(product, sampleHtml);

    // Should only have product_name verified since other fields were null/unknown
    expect(result.fields_verified.product_name).toBeDefined();
    expect(result.overall_accuracy).toBe(1.0);
  });

  it('throws when no API key is available', async () => {
    const originalKey = process.env.GOOGLE_API_KEY;
    delete process.env.GOOGLE_API_KEY;

    const product = makeProduct();
    await expect(validateExtraction(product, sampleHtml, undefined)).rejects.toThrow('GOOGLE_API_KEY');

    process.env.GOOGLE_API_KEY = originalKey;
  });

  it('accepts an explicit API key', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => JSON.stringify({ fields: {} }),
      },
    });

    const product = makeProduct();
    const result = await validateExtraction(product, sampleHtml, 'explicit-key');

    expect(result.validator_model).toBe('gemini-2.5-flash');
  });
});
