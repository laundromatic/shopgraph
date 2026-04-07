/**
 * ShopGraph Client SDK
 *
 * Lightweight client for the ShopGraph REST API.
 * Works in Node.js, Deno, Bun, browsers, and edge runtimes.
 *
 * @example
 * ```ts
 * import { ShopGraph } from 'shopgraph';
 *
 * const sg = new ShopGraph();
 *
 * // Free tier: 500 calls/month, Schema.org only
 * const basic = await sg.enrichBasic('https://example.com/product');
 *
 * // Full extraction with LLM fallback ($0.02/call)
 * const full = await sg.enrichProduct('https://example.com/product', 'pm_stripe_id');
 *
 * // Bring your own HTML ($0.02/call)
 * const html = await sg.enrichHtml('<html>...</html>', 'https://example.com', 'pm_stripe_id');
 * ```
 */

const DEFAULT_BASE_URL = 'https://shopgraph.dev';

export interface ShopGraphConfig {
  baseUrl?: string;
  paymentMethodId?: string;
}

export interface ProductData {
  url: string;
  extracted_at: string;
  extraction_method: 'schema_org' | 'llm' | 'hybrid';
  product_name: string | null;
  brand: string | null;
  description: string | null;
  price: { amount: number | null; currency: string | null; sale_price?: number | null } | null;
  availability: 'in_stock' | 'out_of_stock' | 'preorder' | 'unknown';
  categories: string[];
  image_urls: string[];
  primary_image_url: string | null;
  color: string[];
  material: string[];
  dimensions: Record<string, string> | null;
  confidence: { overall: number; per_field: Record<string, number> };
}

export interface EnrichResponse {
  product: ProductData;
  cached: boolean;
  receipt?: { payment_intent_id: string; amount: number; currency: string; status: string };
  free_tier?: { used: number; limit: number };
  upgrade_hint?: string;
}

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
  tools: string[];
  free_tier: string;
}

export class ShopGraphError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'ShopGraphError';
    this.status = status;
    this.code = code;
  }
}

export class ShopGraph {
  private baseUrl: string;
  private defaultPaymentMethodId?: string;

  constructor(config?: ShopGraphConfig) {
    this.baseUrl = (config?.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.defaultPaymentMethodId = config?.paymentMethodId;
  }

  async enrichBasic(url: string): Promise<EnrichResponse> {
    return this.request('/api/enrich/basic', { url });
  }

  async enrichProduct(url: string, paymentMethodId?: string): Promise<EnrichResponse> {
    return this.request('/api/enrich', {
      url,
      payment_method_id: paymentMethodId ?? this.defaultPaymentMethodId,
    });
  }

  async enrichHtml(html: string, url: string, paymentMethodId?: string): Promise<EnrichResponse> {
    return this.request('/api/enrich/html', {
      html,
      url,
      payment_method_id: paymentMethodId ?? this.defaultPaymentMethodId,
    });
  }

  async health(): Promise<HealthResponse> {
    const res = await fetch(`${this.baseUrl}/health`);
    if (!res.ok) {
      throw new ShopGraphError('Health check failed', res.status, 'health_failed');
    }
    return res.json() as Promise<HealthResponse>;
  }

  private async request(path: string, body: Record<string, unknown>): Promise<EnrichResponse> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json() as EnrichResponse & { error?: string; message?: string };
    if (!res.ok) {
      throw new ShopGraphError(
        data.message ?? data.error ?? `Request failed (${res.status})`,
        res.status,
        data.error ?? 'unknown',
      );
    }
    return data;
  }
}

export default ShopGraph;
