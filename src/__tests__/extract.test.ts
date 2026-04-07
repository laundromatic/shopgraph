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

function mockResponse(body: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : status === 403 ? 'Forbidden' : 'Not Found',
    text: () => Promise.resolve(body),
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
    expect(headers['User-Agent']).toContain('Chrome');
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
    // Setting threshold to 0.90 should scrub availability but keep product_name (0.98)
    const result = await extractProduct('https://example.com/product', {
      strict_confidence_threshold: 0.90,
    });

    // product_name (0.98) should survive
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
