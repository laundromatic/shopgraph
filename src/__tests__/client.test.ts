import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ShopGraph } from '../client.js';

describe('ShopGraph Client', () => {
  let client: ShopGraph;

  beforeEach(() => {
    client = new ShopGraph();
    vi.restoreAllMocks();
  });

  it('creates client with default base URL', () => {
    expect(client).toBeDefined();
  });

  it('creates client with custom base URL', () => {
    const custom = new ShopGraph({ baseUrl: 'http://localhost:3000' });
    expect(custom).toBeDefined();
  });

  it('enrichBasic calls /api/enrich/basic', async () => {
    const mockResponse = {
      product: { product_name: 'Test', brand: 'Brand', price: null, availability: 'unknown' },
      cached: false,
      free_tier: { used: 1, limit: 500 },
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    }));

    const result = await client.enrichBasic('https://example.com/product');
    expect(result).toEqual(mockResponse);

    const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toBe('https://shopgraph.dev/api/enrich/basic');
    expect(JSON.parse(fetchCall[1].body)).toEqual({ url: 'https://example.com/product' });
  });

  it('enrichProduct calls /api/enrich with payment method', async () => {
    const mockResponse = {
      product: { product_name: 'Test', brand: 'Brand' },
      receipt: { payment_intent_id: 'pi_123' },
      cached: false,
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    }));

    const result = await client.enrichProduct('https://example.com/product', 'pm_test');
    expect(result).toEqual(mockResponse);

    const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toBe('https://shopgraph.dev/api/enrich');
    expect(JSON.parse(fetchCall[1].body)).toEqual({
      url: 'https://example.com/product',
      payment_method_id: 'pm_test',
    });
  });

  it('enrichHtml calls /api/enrich/html', async () => {
    const mockResponse = {
      product: { product_name: 'Test' },
      cached: false,
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    }));

    const result = await client.enrichHtml('<html>test</html>', 'https://example.com', 'pm_test');
    expect(result).toEqual(mockResponse);

    const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toBe('https://shopgraph.dev/api/enrich/html');
    expect(JSON.parse(fetchCall[1].body)).toEqual({
      html: '<html>test</html>',
      url: 'https://example.com',
      payment_method_id: 'pm_test',
    });
  });

  it('throws ShopGraphError on 402 payment required', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 402,
      json: () => Promise.resolve({
        error: 'payment_required',
        status: 402,
        message: 'Payment required',
      }),
    }));

    await expect(client.enrichProduct('https://example.com/product'))
      .rejects.toThrow('Payment required');
  });

  it('throws ShopGraphError on 429 rate limit', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: () => Promise.resolve({
        error: 'free_tier_exhausted',
        message: 'Free tier limit reached',
      }),
    }));

    await expect(client.enrichBasic('https://example.com/product'))
      .rejects.toThrow('Free tier limit reached');
  });

  it('health returns status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ status: 'ok', service: 'shopgraph' }),
    }));

    const result = await client.health();
    expect(result.status).toBe('ok');
  });
});
