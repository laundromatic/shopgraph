import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock the LLM module
vi.mock('../llm-extract.js', () => ({
  extractWithLlm: vi.fn(),
}));

// Mock browser-extract module
vi.mock('../browser-extract.js', () => ({
  extractWithBrowser: vi.fn(),
}));

import { extractProduct, extractFromRawHtml } from '../extract.js';
import { extractWithLlm } from '../llm-extract.js';
import { extractWithBrowser } from '../browser-extract.js';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const shopifyHtml = readFileSync(join(FIXTURES, 'shopify-product.html'), 'utf-8');
const noSchemaHtml = readFileSync(join(FIXTURES, 'no-schema-product.html'), 'utf-8');

function mockResponse(body: string, status = 200, extraHeaders: Record<string, string> = {}) {
  const headerMap = new Map(Object.entries(extraHeaders).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : status === 403 ? 'Forbidden' : 'Not Found',
    text: () => Promise.resolve(body),
    headers: {
      has: (name: string) => headerMap.has(name.toLowerCase()),
      get: (name: string) => headerMap.get(name.toLowerCase()) ?? null,
    },
  };
}

/** Build a minimal ProductData for browser mock */
function browserResult(overrides: Record<string, unknown> = {}) {
  return {
    url: 'https://example.com/product',
    extracted_at: new Date().toISOString(),
    extraction_method: 'hybrid' as const,
    product_name: 'Browser Product',
    brand: 'BrowserBrand',
    description: 'Extracted via browser',
    price: { amount: 29.99, currency: 'USD', sale_price: null },
    availability: 'in_stock' as const,
    categories: [],
    image_urls: [],
    primary_image_url: null,
    color: [],
    material: [],
    dimensions: null,
    schema_org_raw: null,
    confidence: { overall: 0.8, per_field: {} },
    ...overrides,
  };
}

const originalEnv = process.env;

beforeEach(() => {
  vi.clearAllMocks();
  // Default: browser fallback disabled
  process.env = { ...originalEnv };
  delete process.env.ENABLE_BROWSER_FALLBACK;
});

afterEach(() => {
  process.env = originalEnv;
});

describe('extractProduct', () => {
  it('uses schema.org when JSON-LD is present', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(shopifyHtml));

    const result = await extractProduct('https://example.com/product');
    expect(result.extraction_method).toBe('schema_org');
    expect(result.product_name).toBe('Vintage Rose Gold Ring');
    expect(result.confidence.overall).toBeGreaterThan(0.9);
    expect(result.url).toBe('https://example.com/product');
  });

  it('falls back to LLM when no schema.org data', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(noSchemaHtml));
    const mockLlm = vi.mocked(extractWithLlm);
    mockLlm.mockResolvedValueOnce({
      extraction_method: 'llm',
      product_name: 'Handmade Ceramic Vase',
      brand: 'ArtisanHome Studio',
      description: 'Beautiful handcrafted ceramic vase',
      price: { amount: 45.0, currency: 'USD', sale_price: 38.5 },
      availability: 'in_stock',
      categories: ['Home Decor', 'Vases'],
      image_urls: ['https://artisanhome.com/images/vase-blue-1.jpg'],
      primary_image_url: 'https://artisanhome.com/images/vase-blue-1.jpg',
      color: ['Blue'],
      material: ['Ceramic'],
      dimensions: { height: '12 inches', width: '6 inches' },
      schema_org_raw: null,
      confidence: { overall: 0.7, per_field: { product_name: 0.7 } },
    });

    const result = await extractProduct('https://example.com/vase');
    expect(result.extraction_method).toBe('llm');
    expect(result.product_name).toBe('Handmade Ceramic Vase');
    expect(result.confidence.overall).toBeLessThan(0.9);
  });

  it('returns empty product when both methods fail', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(noSchemaHtml));
    vi.mocked(extractWithLlm).mockResolvedValueOnce(null);

    const result = await extractProduct('https://example.com/empty');
    expect(result.product_name).toBeNull();
    expect(result.confidence.overall).toBe(0);
  });

  it('throws on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse('Not Found', 404));

    await expect(extractProduct('https://example.com/missing')).rejects.toThrow('HTTP 404');
  });

  it('throws on network timeout', async () => {
    mockFetch.mockRejectedValueOnce(new Error('The operation was aborted'));

    await expect(extractProduct('https://example.com/slow')).rejects.toThrow('aborted');
  });

  it('includes url and extracted_at in result', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(shopifyHtml));

    const result = await extractProduct('https://example.com/product');
    expect(result.url).toBe('https://example.com/product');
    expect(result.extracted_at).toBeTruthy();
    // ISO date format
    expect(new Date(result.extracted_at).toISOString()).toBe(result.extracted_at);
  });

  it('includes all expected fields in schema.org result', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(shopifyHtml));

    const result = await extractProduct('https://example.com/product');
    expect(result).toHaveProperty('url');
    expect(result).toHaveProperty('extracted_at');
    expect(result).toHaveProperty('extraction_method');
    expect(result).toHaveProperty('product_name');
    expect(result).toHaveProperty('brand');
    expect(result).toHaveProperty('description');
    expect(result).toHaveProperty('price');
    expect(result).toHaveProperty('availability');
    expect(result).toHaveProperty('categories');
    expect(result).toHaveProperty('image_urls');
    expect(result).toHaveProperty('primary_image_url');
    expect(result).toHaveProperty('color');
    expect(result).toHaveProperty('material');
    expect(result).toHaveProperty('dimensions');
    expect(result).toHaveProperty('schema_org_raw');
    expect(result).toHaveProperty('confidence');
  });

  it('sends realistic User-Agent header', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(shopifyHtml));

    await extractProduct('https://example.com/product');
    const fetchCall = mockFetch.mock.calls[0];
    const headers = fetchCall[1].headers;
    expect(headers['User-Agent']).toBe('ShopGraph/1.0');
  });
});

describe('browser fallback', () => {
  it('does NOT trigger browser when fetch succeeds with price data', async () => {
    // shopifyHtml has price in schema.org
    mockFetch.mockResolvedValueOnce(mockResponse(shopifyHtml));
    process.env.ENABLE_BROWSER_FALLBACK = 'true';

    const result = await extractProduct('https://example.com/product');
    expect(result.extraction_method).toBe('schema_org');
    expect(result.price).not.toBeNull();
    expect(extractWithBrowser).not.toHaveBeenCalled();
  });

  it('triggers browser fallback when fetch result has no price AND no availability', async () => {
    // Return HTML with no schema.org, LLM returns data but no price/availability
    mockFetch.mockResolvedValueOnce(mockResponse(noSchemaHtml));
    vi.mocked(extractWithLlm).mockResolvedValueOnce({
      extraction_method: 'llm',
      product_name: 'Target Lamp',
      brand: null,
      description: 'A lamp from Target',
      price: null,
      availability: 'unknown',
      categories: [],
      image_urls: [],
      primary_image_url: null,
      color: [],
      material: [],
      dimensions: null,
      schema_org_raw: null,
      confidence: { overall: 0.5, per_field: {} },
    });
    vi.mocked(extractWithBrowser).mockResolvedValueOnce(browserResult());
    process.env.ENABLE_BROWSER_FALLBACK = 'true';

    const result = await extractProduct('https://target.com/lamp');
    expect(extractWithBrowser).toHaveBeenCalledWith('https://target.com/lamp');
    expect(result.extraction_method).toBe('hybrid');
    expect(result.price).not.toBeNull();
  });

  it('triggers browser fallback on 403 (bot blocked)', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse('Forbidden', 403));
    vi.mocked(extractWithBrowser).mockResolvedValueOnce(browserResult());
    process.env.ENABLE_BROWSER_FALLBACK = 'true';

    const result = await extractProduct('https://example.com/blocked');
    expect(extractWithBrowser).toHaveBeenCalledWith('https://example.com/blocked');
    expect(result.extraction_method).toBe('hybrid');
  });

  it('returns original fetch result when browser fallback also fails', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(noSchemaHtml));
    vi.mocked(extractWithLlm).mockResolvedValueOnce({
      extraction_method: 'llm',
      product_name: 'Partial Product',
      brand: null,
      description: null,
      price: null,
      availability: 'unknown',
      categories: [],
      image_urls: [],
      primary_image_url: null,
      color: [],
      material: [],
      dimensions: null,
      schema_org_raw: null,
      confidence: { overall: 0.3, per_field: {} },
    });
    vi.mocked(extractWithBrowser).mockRejectedValueOnce(new Error('Browser launch failed'));
    process.env.ENABLE_BROWSER_FALLBACK = 'true';

    const result = await extractProduct('https://example.com/partial');
    // Should return the original fetch result (partial data better than nothing)
    expect(result.product_name).toBe('Partial Product');
    expect(result.extraction_method).toBe('llm');
  });

  it('re-throws 403 when browser fallback fails and there is no fetch result', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse('Forbidden', 403));
    vi.mocked(extractWithBrowser).mockRejectedValueOnce(new Error('Browser launch failed'));
    process.env.ENABLE_BROWSER_FALLBACK = 'true';

    await expect(extractProduct('https://example.com/blocked')).rejects.toThrow('HTTP 403');
  });

  it('NEVER triggers browser when ENABLE_BROWSER_FALLBACK is not set', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(noSchemaHtml));
    vi.mocked(extractWithLlm).mockResolvedValueOnce({
      extraction_method: 'llm',
      product_name: 'No Price Product',
      brand: null,
      description: null,
      price: null,
      availability: 'unknown',
      categories: [],
      image_urls: [],
      primary_image_url: null,
      color: [],
      material: [],
      dimensions: null,
      schema_org_raw: null,
      confidence: { overall: 0.3, per_field: {} },
    });
    // ENABLE_BROWSER_FALLBACK is NOT set (deleted in beforeEach)

    const result = await extractProduct('https://example.com/no-price');
    expect(extractWithBrowser).not.toHaveBeenCalled();
    expect(result.product_name).toBe('No Price Product');
  });

  it('NEVER triggers browser when ENABLE_BROWSER_FALLBACK=false', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(noSchemaHtml));
    vi.mocked(extractWithLlm).mockResolvedValueOnce({
      extraction_method: 'llm',
      product_name: 'No Price Product',
      brand: null,
      description: null,
      price: null,
      availability: 'unknown',
      categories: [],
      image_urls: [],
      primary_image_url: null,
      color: [],
      material: [],
      dimensions: null,
      schema_org_raw: null,
      confidence: { overall: 0.3, per_field: {} },
    });
    process.env.ENABLE_BROWSER_FALLBACK = 'false';

    const result = await extractProduct('https://example.com/no-price');
    expect(extractWithBrowser).not.toHaveBeenCalled();
  });

  it('does NOT trigger browser when result has price but no availability', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(noSchemaHtml));
    vi.mocked(extractWithLlm).mockResolvedValueOnce({
      extraction_method: 'llm',
      product_name: 'Product With Price',
      brand: null,
      description: null,
      price: { amount: 19.99, currency: 'USD', sale_price: null },
      availability: 'unknown',
      categories: [],
      image_urls: [],
      primary_image_url: null,
      color: [],
      material: [],
      dimensions: null,
      schema_org_raw: null,
      confidence: { overall: 0.5, per_field: {} },
    });
    process.env.ENABLE_BROWSER_FALLBACK = 'true';

    const result = await extractProduct('https://example.com/has-price');
    // Has price, so no fallback needed even though availability is unknown
    expect(extractWithBrowser).not.toHaveBeenCalled();
  });

  it('does NOT trigger browser when result has availability but no price', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(noSchemaHtml));
    vi.mocked(extractWithLlm).mockResolvedValueOnce({
      extraction_method: 'llm',
      product_name: 'Product In Stock',
      brand: null,
      description: null,
      price: null,
      availability: 'in_stock',
      categories: [],
      image_urls: [],
      primary_image_url: null,
      color: [],
      material: [],
      dimensions: null,
      schema_org_raw: null,
      confidence: { overall: 0.5, per_field: {} },
    });
    process.env.ENABLE_BROWSER_FALLBACK = 'true';

    const result = await extractProduct('https://example.com/in-stock');
    // Has availability, so no fallback needed even though price is null
    expect(extractWithBrowser).not.toHaveBeenCalled();
  });
});

describe('_shopgraph metadata', () => {
  it('is always present on extraction results', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(shopifyHtml));

    const result = await extractProduct('https://example.com/product');
    expect(result._shopgraph).toBeDefined();
    expect(result._shopgraph!.source_url).toBe('https://example.com/product');
    expect(result._shopgraph!.extraction_method).toBe('schema_org');
    expect(result._shopgraph!.confidence_method).toBe('tier_baseline');
    expect(result._shopgraph!.extraction_timestamp).toBeTruthy();
    expect(Object.keys(result._shopgraph!.field_confidence).length).toBeGreaterThan(0);
  });

  it('is present even when no data extracted', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(noSchemaHtml));
    vi.mocked(extractWithLlm).mockResolvedValueOnce(null);

    const result = await extractProduct('https://example.com/empty');
    expect(result._shopgraph).toBeDefined();
    expect(result._shopgraph!.confidence_method).toBe('tier_baseline');
  });
});

describe('strict_confidence_threshold', () => {
  it('scrubs fields below threshold and adds _extraction_status', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(shopifyHtml));

    // Schema.org extraction: availability gets 0.83 confidence (0.93 - 0.10)
    // Setting threshold to 0.90 should scrub availability but keep product_name (0.93)
    const result = await extractProduct('https://example.com/product', {
      strict_confidence_threshold: 0.90,
    });

    // product_name (0.93) should survive
    expect(result.product_name).toBe('Vintage Rose Gold Ring');
    // availability (0.83) should be scrubbed
    expect(result.availability).toBe('unknown');
    // description (0.88) should be scrubbed
    expect(result.description).toBeNull();

    expect(result._extraction_status).toBeDefined();
    expect(result._extraction_status!.availability).toBeDefined();
    expect(result._extraction_status!.availability.status).toBe('below_threshold');
    expect(result._extraction_status!.availability.confidence).toBeCloseTo(0.83, 1);
    expect(result._extraction_status!.availability.threshold).toBe(0.90);
  });

  it('does not scrub when threshold is not provided', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(shopifyHtml));

    const result = await extractProduct('https://example.com/product');
    expect(result._extraction_status).toBeUndefined();
    expect(result.availability).toBe('in_stock');
  });

  it('does not scrub when all fields are above threshold', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(shopifyHtml));

    const result = await extractProduct('https://example.com/product', {
      strict_confidence_threshold: 0.50,
    });

    expect(result._extraction_status).toBeUndefined();
    expect(result.product_name).toBe('Vintage Rose Gold Ring');
    expect(result.availability).toBe('in_stock');
  });
});

describe('_shopgraph.field_method (per-field extraction tier)', () => {
  it('tags every confidence-scored field as schema_org for a pure Schema.org extraction', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(shopifyHtml));

    const result = await extractProduct('https://example.com/product');
    const fieldMethod = result._shopgraph!.field_method;
    const fieldConfidence = result._shopgraph!.field_confidence;

    expect(fieldMethod).toBeDefined();
    // Every key in field_confidence must have a matching key in field_method
    for (const key of Object.keys(fieldConfidence)) {
      expect(fieldMethod![key]).toBe('schema_org');
    }
    expect(fieldMethod!.product_name).toBe('schema_org');
    expect(fieldMethod!.price).toBe('schema_org');
  });

  it('tags every confidence-scored field as llm for a pure LLM extraction', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(noSchemaHtml));
    vi.mocked(extractWithLlm).mockResolvedValueOnce({
      extraction_method: 'llm',
      product_name: 'LLM-Only Product',
      brand: 'LlmBrand',
      description: 'A fine product',
      price: { amount: 12.34, currency: 'USD', sale_price: null },
      availability: 'in_stock',
      categories: [],
      image_urls: [],
      primary_image_url: null,
      color: [],
      material: [],
      dimensions: null,
      schema_org_raw: null,
      confidence: {
        overall: 0.70,
        per_field: {
          product_name: 0.75,
          brand: 0.70,
          description: 0.65,
          price: 0.70,
          availability: 0.60,
        },
        per_field_method: {
          product_name: 'llm',
          brand: 'llm',
          description: 'llm',
          price: 'llm',
          availability: 'llm',
        },
        per_field_modifiers: {
          product_name: [
            { base: 0.70, method: 'llm' },
            { delta: 0.05, reason: 'Structured data match' },
            { result: 0.75 },
          ],
          brand: [
            { base: 0.70, method: 'llm' },
            { result: 0.70 },
          ],
          description: [
            { base: 0.70, method: 'llm' },
            { delta: -0.05, reason: 'LLM inferred', source: 'value interpreted from unstructured text' },
            { result: 0.65 },
          ],
          price: [
            { base: 0.70, method: 'llm' },
            { result: 0.70 },
          ],
          availability: [
            { base: 0.70, method: 'llm' },
            { delta: -0.10, reason: 'LLM inferred', source: 'value interpreted from unstructured text' },
            { result: 0.60 },
          ],
        },
      },
    });

    const result = await extractProduct('https://example.com/llm-only');
    const fieldMethod = result._shopgraph!.field_method!;
    expect(Object.keys(fieldMethod).length).toBeGreaterThan(0);
    for (const method of Object.values(fieldMethod)) {
      expect(['llm', 'llm_boosted']).toContain(method);
    }
    expect(fieldMethod.product_name).toBe('llm');
  });

  it('tags agreed-on fields as hybrid and disagreed fields with the winning tier for a merge', async () => {
    // Primary (schema.org) has partial data — product_name and price ONLY.
    // Partial schema triggers LLM auto-heal. LLM returns product_name that
    // AGREES with schema.org, plus brand/description/availability that schema
    // didn't have. After merge, product_name should be tagged 'hybrid';
    // brand/description/availability should be tagged 'llm'.
    const partialSchemaHtml = `<script type="application/ld+json">
      {"@type": "Product", "name": "Agreed Product Name"}
    </script>`;
    mockFetch.mockResolvedValueOnce(mockResponse(partialSchemaHtml));
    vi.mocked(extractWithLlm).mockResolvedValueOnce({
      extraction_method: 'llm',
      product_name: 'Agreed Product Name', // AGREES with schema.org
      brand: 'LlmBrand',
      description: 'LLM description',
      price: { amount: 99.99, currency: 'USD', sale_price: null },
      availability: 'in_stock',
      categories: [],
      image_urls: [],
      primary_image_url: null,
      color: [],
      material: [],
      dimensions: null,
      schema_org_raw: null,
      confidence: {
        overall: 0.70,
        per_field: {
          product_name: 0.75,
          brand: 0.70,
          description: 0.65,
          price: 0.70,
          availability: 0.60,
        },
        per_field_method: {
          product_name: 'llm',
          brand: 'llm',
          description: 'llm',
          price: 'llm',
          availability: 'llm',
        },
        per_field_modifiers: {
          product_name: [
            { base: 0.70, method: 'llm' },
            { delta: 0.05, reason: 'Structured data match' },
            { result: 0.75 },
          ],
          brand: [{ base: 0.70, method: 'llm' }, { result: 0.70 }],
          description: [
            { base: 0.70, method: 'llm' },
            { delta: -0.05, reason: 'LLM inferred' },
            { result: 0.65 },
          ],
          price: [{ base: 0.70, method: 'llm' }, { result: 0.70 }],
          availability: [
            { base: 0.70, method: 'llm' },
            { delta: -0.10, reason: 'LLM inferred' },
            { result: 0.60 },
          ],
        },
      },
    });

    const result = await extractProduct('https://example.com/hybrid');
    const fieldMethod = result._shopgraph!.field_method!;

    expect(result.extraction_method).toBe('hybrid');
    // product_name: both produced the same value → hybrid
    expect(fieldMethod.product_name).toBe('hybrid');
    // brand: only LLM produced → llm
    expect(fieldMethod.brand).toBe('llm');
    // description: only LLM produced → llm
    expect(fieldMethod.description).toBe('llm');
    // availability: only LLM produced → llm
    expect(fieldMethod.availability).toBe('llm');
  });
});

describe('_shopgraph.field_modifiers (per-field confidence ledger)', () => {
  function sumLedger(ledger: Array<Record<string, unknown>>): {
    base: number; sumDeltas: number; result: number;
  } {
    let base = 0;
    let sumDeltas = 0;
    let result = 0;
    for (const e of ledger) {
      if ('base' in e && typeof e.base === 'number') base = e.base;
      if ('delta' in e && typeof e.delta === 'number') sumDeltas += e.delta;
      if ('result' in e && typeof e.result === 'number') result = e.result;
    }
    return { base, sumDeltas, result };
  }

  it('present for every confidence-scored field in a pure Schema.org extraction and sums to result', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(shopifyHtml));

    const result = await extractProduct('https://example.com/product');
    const fieldModifiers = result._shopgraph!.field_modifiers;
    const fieldConfidence = result._shopgraph!.field_confidence;

    expect(fieldModifiers).toBeDefined();
    expect(Object.keys(fieldModifiers!).length).toBeGreaterThan(0);

    for (const field of Object.keys(fieldConfidence)) {
      const ledger = fieldModifiers![field];
      expect(ledger, `ledger missing for ${field}`).toBeDefined();
      // Order: base → delta(s) → result
      expect(ledger[0]).toHaveProperty('base');
      expect(ledger[ledger.length - 1]).toHaveProperty('result');
      // Sum identity: base + sum(deltas) = result (within 0.01)
      const { base, sumDeltas, result: res } = sumLedger(ledger as Array<Record<string, unknown>>);
      expect(Math.abs(base + sumDeltas - res)).toBeLessThanOrEqual(0.01);
      // Deltas use only approved reasons
      for (const entry of ledger) {
        if ('delta' in entry) {
          expect([
            'Structured data match',
            'Cross-validation',
            'Single source',
            'LLM inferred',
            'Stale cache',
          ]).toContain((entry as { reason: string }).reason);
        }
      }
    }
  });

  it('present for every confidence-scored field in a pure LLM extraction and sums to result', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(noSchemaHtml));
    vi.mocked(extractWithLlm).mockResolvedValueOnce({
      extraction_method: 'llm',
      product_name: 'LLM Product',
      brand: null,
      description: 'A fine product',
      price: { amount: 20.00, currency: 'USD', sale_price: null },
      availability: 'in_stock',
      categories: [],
      image_urls: [],
      primary_image_url: null,
      color: [],
      material: [],
      dimensions: null,
      schema_org_raw: null,
      confidence: {
        overall: 0.70,
        per_field: {
          product_name: 0.75,
          description: 0.65,
          price: 0.70,
          availability: 0.60,
        },
        per_field_method: {
          product_name: 'llm',
          description: 'llm',
          price: 'llm',
          availability: 'llm',
        },
        per_field_modifiers: {
          product_name: [
            { base: 0.70, method: 'llm' },
            { delta: 0.05, reason: 'Structured data match' },
            { result: 0.75 },
          ],
          description: [
            { base: 0.70, method: 'llm' },
            { delta: -0.05, reason: 'LLM inferred', source: 'value interpreted from unstructured text' },
            { result: 0.65 },
          ],
          price: [{ base: 0.70, method: 'llm' }, { result: 0.70 }],
          availability: [
            { base: 0.70, method: 'llm' },
            { delta: -0.10, reason: 'LLM inferred', source: 'value interpreted from unstructured text' },
            { result: 0.60 },
          ],
        },
      },
    });

    const result = await extractProduct('https://example.com/llm-ledger');
    const fieldModifiers = result._shopgraph!.field_modifiers!;
    const fieldConfidence = result._shopgraph!.field_confidence;

    for (const field of Object.keys(fieldConfidence)) {
      const ledger = fieldModifiers[field];
      expect(ledger, `ledger missing for ${field}`).toBeDefined();
      expect(ledger[0]).toHaveProperty('base');
      expect(ledger[ledger.length - 1]).toHaveProperty('result');
      const { base, sumDeltas, result: res } = sumLedger(ledger as Array<Record<string, unknown>>);
      expect(Math.abs(base + sumDeltas - res)).toBeLessThanOrEqual(0.01);
    }
  });

  it('present for every confidence-scored field in a hybrid merge and sums to result', async () => {
    const partialSchemaHtml = `<script type="application/ld+json">
      {"@type": "Product", "name": "Hybrid Product"}
    </script>`;
    mockFetch.mockResolvedValueOnce(mockResponse(partialSchemaHtml));
    vi.mocked(extractWithLlm).mockResolvedValueOnce({
      extraction_method: 'llm',
      product_name: 'Hybrid Product', // agrees with schema.org
      brand: 'LlmBrand',
      description: 'Filled by LLM',
      price: { amount: 42.00, currency: 'USD', sale_price: null },
      availability: 'in_stock',
      categories: [],
      image_urls: [],
      primary_image_url: null,
      color: [],
      material: [],
      dimensions: null,
      schema_org_raw: null,
      confidence: {
        overall: 0.70,
        per_field: {
          product_name: 0.75,
          brand: 0.70,
          description: 0.65,
          price: 0.70,
          availability: 0.60,
        },
        per_field_method: {
          product_name: 'llm',
          brand: 'llm',
          description: 'llm',
          price: 'llm',
          availability: 'llm',
        },
        per_field_modifiers: {
          product_name: [
            { base: 0.70, method: 'llm' },
            { delta: 0.05, reason: 'Structured data match' },
            { result: 0.75 },
          ],
          brand: [{ base: 0.70, method: 'llm' }, { result: 0.70 }],
          description: [
            { base: 0.70, method: 'llm' },
            { delta: -0.05, reason: 'LLM inferred' },
            { result: 0.65 },
          ],
          price: [{ base: 0.70, method: 'llm' }, { result: 0.70 }],
          availability: [
            { base: 0.70, method: 'llm' },
            { delta: -0.10, reason: 'LLM inferred' },
            { result: 0.60 },
          ],
        },
      },
    });

    const result = await extractProduct('https://example.com/hybrid-ledger');
    const fieldModifiers = result._shopgraph!.field_modifiers!;
    const fieldConfidence = result._shopgraph!.field_confidence;
    const fieldMethod = result._shopgraph!.field_method!;

    // All confidence-scored fields have a ledger
    for (const field of Object.keys(fieldConfidence)) {
      const ledger = fieldModifiers[field];
      expect(ledger, `ledger missing for ${field}`).toBeDefined();
      expect(ledger[0]).toHaveProperty('base');
      expect(ledger[ledger.length - 1]).toHaveProperty('result');
      const { base, sumDeltas, result: res } = sumLedger(ledger as Array<Record<string, unknown>>);
      expect(Math.abs(base + sumDeltas - res)).toBeLessThanOrEqual(0.01);
    }

    // Hybrid field: base entry's method should be 'hybrid'
    expect(fieldMethod.product_name).toBe('hybrid');
    const hybridLedger = fieldModifiers.product_name as Array<Record<string, unknown>>;
    expect((hybridLedger[0] as { base: number; method: string }).method).toBe('hybrid');
  });
});

describe('applyThresholdAndMetadata — fromCache freshness', () => {
  // Minimal product fixture with explicit extracted_at so we can age it
  function buildCachedProduct(extractedAt: string) {
    return {
      url: 'https://example.com/product',
      extracted_at: extractedAt,
      extraction_method: 'schema_org' as const,
      product_name: 'Test Product',
      brand: 'TestBrand',
      description: 'desc',
      price: { amount: 9.99, currency: 'USD', sale_price: null },
      availability: 'in_stock' as const,
      categories: [],
      image_urls: [],
      primary_image_url: null,
      color: [],
      material: [],
      dimensions: null,
      schema_org_raw: null,
      confidence: {
        overall: 0.9,
        per_field: { price: 0.93, brand: 0.85, product_name: 0.9 },
      },
    };
  }

  it('does NOT attach field_freshness when fromCache=false (live extraction)', async () => {
    const { applyThresholdAndMetadata } = await import('../extract.js');
    const product = buildCachedProduct(new Date().toISOString());
    const result = applyThresholdAndMetadata({ ...product }, undefined, false);

    expect(result._shopgraph).toBeDefined();
    expect(result._shopgraph?.data_source).toBe('live');
    expect(result._shopgraph?.field_freshness).toBeUndefined();
    // Confidence values match originals when not from cache
    expect(result._shopgraph?.field_confidence?.price).toBe(0.93);
  });

  it('attaches field_freshness and decays confidence when fromCache=true', async () => {
    const { applyThresholdAndMetadata } = await import('../extract.js');
    // Aged 4 hours (4 * half-lives for real_time fields like price)
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    const product = buildCachedProduct(fourHoursAgo);
    const result = applyThresholdAndMetadata({ ...product }, undefined, true);

    expect(result._shopgraph).toBeDefined();
    expect(result._shopgraph?.data_source).toBe('cache');
    expect(result._shopgraph?.field_freshness).toBeDefined();

    const freshness = result._shopgraph!.field_freshness!;
    // price is real_time (30min half-life) — 4 hours = 8 half-lives → decayed
    expect(freshness.price.volatility_class).toBe('real_time');
    expect(freshness.price.decayed).toBe(true);
    expect(freshness.price.original_confidence).toBe(0.93);

    // Effective confidence should be heavily decayed for price
    const decayedPrice = result._shopgraph!.field_confidence!.price;
    expect(decayedPrice).toBeLessThan(0.05);

    // brand is stable (7d half-life) — 4 hours barely touches it
    expect(freshness.brand.volatility_class).toBe('stable');
    expect(freshness.brand.decayed).toBe(false);
  });

  it('threshold scrubbing operates on decayed confidence when fromCache=true', async () => {
    const { applyThresholdAndMetadata } = await import('../extract.js');
    // Aged 4 hours — price will decay below 0.5 threshold even though base is 0.93
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    const product = buildCachedProduct(fourHoursAgo);
    const result = applyThresholdAndMetadata({ ...product }, { strict_confidence_threshold: 0.5 }, true);

    // price field should be scrubbed because decayed confidence < 0.5
    expect(result.price).toBeNull();
    expect(result._extraction_status?.price?.status).toBe('below_threshold');
  });
});
