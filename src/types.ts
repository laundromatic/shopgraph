/**
 * Core product data interface returned by the enrichment engine.
 */
export interface ProductData {
  url: string;
  extracted_at: string;
  extraction_method: 'schema_org' | 'llm' | 'hybrid';
  product_name: string | null;
  brand: string | null;
  description: string | null;
  price: PriceData | null;
  availability: 'in_stock' | 'out_of_stock' | 'preorder' | 'unknown';
  categories: string[];
  image_urls: string[];
  primary_image_url: string | null;
  color: string[];
  material: string[];
  dimensions: Record<string, string> | null;
  schema_org_raw: Record<string, unknown> | null;
  confidence: ConfidenceData;
  _shopgraph?: ShopGraphMetadata;
  _extraction_status?: Record<string, ExtractionStatus>;
}

export interface PriceData {
  amount: number | null;
  currency: string | null;
  sale_price?: number | null;
}

export interface ConfidenceData {
  overall: number;
  per_field: Record<string, number>;
}

/**
 * Payment receipt returned alongside enrichment results.
 */
export interface PaymentReceipt {
  payment_intent_id: string;
  amount: number;
  currency: string;
  status: string;
  tool: string;
  created_at: string;
}

/**
 * MPP challenge returned on 402 responses.
 */
export interface MppChallenge {
  type: 'payment_required';
  provider: 'stripe';
  amount: number;
  currency: string;
  description: string;
  payment_methods: string[];
  stripe_publishable_key?: string;
}

/**
 * Enrichment result combining product data and optional payment receipt.
 */
export interface EnrichmentResult {
  product: ProductData;
  receipt?: PaymentReceipt;
  cached: boolean;
}

/**
 * Tool pricing configuration in cents.
 * Free-tier tools have a price of 0 but are rate-limited.
 */
export interface ToolPricing {
  enrich_product: number;
  enrich_basic: number;
  enrich_html: number;
}

export const TOOL_PRICING: ToolPricing = {
  enrich_product: 2,  // $0.02
  enrich_basic: 1,    // $0.01 (Stripe minimum)
  enrich_html: 2,     // $0.02 (same as enrich_product — full extraction)
};

/**
 * Free tier configuration.
 */
export const FREE_TIER = {
  MONTHLY_LIMIT: 200,
  TOOLS: ['enrich_basic'] as const,  // Only enrich_basic is free-tier eligible
};

// ── Confidence scoring ──────────────────────────────────────────────
export const SCHEMA_ORG_BASELINE = 0.93;
export const LLM_BASE_BASELINE = 0.70;
export const LLM_LOW_BASELINE = 0.60;
export const LLM_BOOSTED_BASELINE = 0.85;

/** Per-field confidence modifiers applied on top of tier baselines */
export const FIELD_CONFIDENCE_MODIFIERS: Record<string, number> = {
  product_name: 0.05,
  brand: 0.00,
  description: -0.05,
  price: 0.00,
  availability: -0.10,
  categories: 0.00,
  image_urls: 0.00,
  primary_image_url: 0.00,
  color: -0.05,
  material: -0.05,
  dimensions: -0.05,
};

/** Get confidence for a specific field, clamped to [0, 1] */
export function getFieldConfidence(baseline: number, fieldName: string): number {
  const modifier = FIELD_CONFIDENCE_MODIFIERS[fieldName] ?? 0;
  return Math.max(0, Math.min(1, baseline + modifier));
}

export interface EnrichmentOptions {
  strict_confidence_threshold?: number | null;
  format?: 'default' | 'ucp';
}

export interface ShopGraphMetadata {
  source_url: string;
  extraction_timestamp: string;
  extraction_method: string;
  field_confidence: Record<string, number>;
  confidence_method: string;
}

export interface ExtractionStatus {
  status: 'below_threshold' | 'not_available';
  confidence?: number;
  threshold?: number;
  message: string;
}
