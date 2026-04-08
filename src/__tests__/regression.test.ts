import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProductData } from '../types.js';

// Mock Redis
const mockRedis = {
  set: vi.fn().mockResolvedValue('OK'),
  get: vi.fn().mockResolvedValue(null),
  scan: vi.fn().mockResolvedValue([0, []]),
};

vi.mock('../stats.js', () => ({
  hashUrl: (url: string) => {
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  },
}));

import { saveSnapshot, checkRegression, getRegressionCount } from '../regression.js';
import type { RegressionSnapshot } from '../regression.js';

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
    confidence: { overall: 0.9, per_field: { product_name: 0.95 } },
    ...overrides,
  };
}

describe('saveSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves a snapshot with correct fields and TTL', async () => {
    const product = makeProduct();
    await saveSnapshot(mockRedis as never, 'https://example.com/product', product);

    expect(mockRedis.set).toHaveBeenCalledTimes(1);
    const [key, snapshot, options] = mockRedis.set.mock.calls[0];
    expect(key).toMatch(/^regression:/);
    expect(snapshot.product_name).toBe('Test Widget');
    expect(snapshot.brand).toBe('Acme');
    expect(snapshot.price_amount).toBe(29.99);
    expect(snapshot.price_currency).toBe('USD');
    expect(snapshot.availability).toBe('in_stock');
    expect(snapshot.confidence_overall).toBe(0.9);
    expect(options.ex).toBe(90 * 24 * 60 * 60);
  });

  it('handles null price gracefully', async () => {
    const product = makeProduct({ price: null });
    await saveSnapshot(mockRedis as never, 'https://example.com/product', product);

    const snapshot = mockRedis.set.mock.calls[0][1];
    expect(snapshot.price_amount).toBeNull();
    expect(snapshot.price_currency).toBeNull();
  });
});

describe('checkRegression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns no regression when no snapshot exists', async () => {
    mockRedis.get.mockResolvedValue(null);
    const product = makeProduct();
    const result = await checkRegression(mockRedis as never, 'https://example.com/product', product);

    expect(result.regressed).toBe(false);
    expect(Object.keys(result.changes)).toHaveLength(0);
  });

  it('returns no regression when values are stable', async () => {
    const snapshot: RegressionSnapshot = {
      url: 'https://example.com/product',
      snapshot_at: '2026-04-01T00:00:00Z',
      product_name: 'Test Widget',
      brand: 'Acme',
      price_amount: 29.99,
      price_currency: 'USD',
      availability: 'in_stock',
      confidence_overall: 0.9,
    };
    mockRedis.get.mockResolvedValue(snapshot);

    const product = makeProduct();
    const result = await checkRegression(mockRedis as never, 'https://example.com/product', product);

    expect(result.regressed).toBe(false);
    expect(Object.keys(result.changes)).toHaveLength(0);
  });

  it('detects product_name change', async () => {
    const snapshot: RegressionSnapshot = {
      url: 'https://example.com/product',
      snapshot_at: '2026-04-01T00:00:00Z',
      product_name: 'Test Widget',
      brand: 'Acme',
      price_amount: 29.99,
      price_currency: 'USD',
      availability: 'in_stock',
      confidence_overall: 0.9,
    };
    mockRedis.get.mockResolvedValue(snapshot);

    const product = makeProduct({ product_name: 'Completely Different Product' });
    const result = await checkRegression(mockRedis as never, 'https://example.com/product', product);

    expect(result.regressed).toBe(true);
    expect(result.changes.product_name).toEqual({
      old: 'Test Widget',
      new: 'Completely Different Product',
    });
  });

  it('detects price change >10%', async () => {
    const snapshot: RegressionSnapshot = {
      url: 'https://example.com/product',
      snapshot_at: '2026-04-01T00:00:00Z',
      product_name: 'Test Widget',
      brand: 'Acme',
      price_amount: 100.00,
      price_currency: 'USD',
      availability: 'in_stock',
      confidence_overall: 0.9,
    };
    mockRedis.get.mockResolvedValue(snapshot);

    const product = makeProduct({ price: { amount: 85.00, currency: 'USD' } });
    const result = await checkRegression(mockRedis as never, 'https://example.com/product', product);

    expect(result.regressed).toBe(true);
    expect(result.changes.price_amount).toEqual({ old: 100.00, new: 85.00 });
  });

  it('does not flag price change within 10%', async () => {
    const snapshot: RegressionSnapshot = {
      url: 'https://example.com/product',
      snapshot_at: '2026-04-01T00:00:00Z',
      product_name: 'Test Widget',
      brand: 'Acme',
      price_amount: 100.00,
      price_currency: 'USD',
      availability: 'in_stock',
      confidence_overall: 0.9,
    };
    mockRedis.get.mockResolvedValue(snapshot);

    const product = makeProduct({ price: { amount: 95.00, currency: 'USD' } });
    const result = await checkRegression(mockRedis as never, 'https://example.com/product', product);

    expect(result.regressed).toBe(false);
  });

  it('detects availability flip', async () => {
    const snapshot: RegressionSnapshot = {
      url: 'https://example.com/product',
      snapshot_at: '2026-04-01T00:00:00Z',
      product_name: 'Test Widget',
      brand: 'Acme',
      price_amount: 29.99,
      price_currency: 'USD',
      availability: 'in_stock',
      confidence_overall: 0.9,
    };
    mockRedis.get.mockResolvedValue(snapshot);

    const product = makeProduct({ availability: 'out_of_stock' });
    const result = await checkRegression(mockRedis as never, 'https://example.com/product', product);

    expect(result.regressed).toBe(true);
    expect(result.changes.availability).toEqual({
      old: 'in_stock',
      new: 'out_of_stock',
    });
  });
});

describe('getRegressionCount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 0 when no regression keys exist', async () => {
    mockRedis.scan.mockResolvedValue([0, []]);
    const count = await getRegressionCount(mockRedis as never);
    expect(count).toBe(0);
  });

  it('counts regression keys', async () => {
    mockRedis.scan.mockResolvedValue([0, ['regression:abc', 'regression:def']]);
    const count = await getRegressionCount(mockRedis as never);
    expect(count).toBe(2);
  });
});
