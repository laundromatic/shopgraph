/**
 * Extraction tier enum used by both document-level `extraction_method`
 * and per-field `_shopgraph.field_method` attribution.
 */
export type ExtractionMethod = 'schema_org' | 'llm' | 'llm_boosted' | 'hybrid' | 'playwright';

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
  /** Per-field attribution: which extraction tier produced each value. */
  per_field_method?: Record<string, ExtractionMethod>;
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
  MONTHLY_LIMIT: 50,
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
  force_refresh?: boolean;
  minimum_confidence?: number | null;
  format?: 'default' | 'ucp';
  include_score?: boolean;
}

// ── Volatility & decay ────────────────────────────────────────────
export type VolatilityClass = 'real_time' | 'volatile' | 'slow_change' | 'stable';

/** Half-life in seconds for each volatility class */
export const VOLATILITY_HALF_LIFE: Record<VolatilityClass, number> = {
  real_time: 30 * 60,        // 30 minutes
  volatile: 2 * 60 * 60,     // 2 hours
  slow_change: 24 * 60 * 60, // 24 hours
  stable: 7 * 24 * 60 * 60,  // 7 days
};

/** Map each product field to its volatility class */
export const FIELD_VOLATILITY: Record<string, VolatilityClass> = {
  price: 'real_time',
  availability: 'real_time',
  product_name: 'slow_change',
  brand: 'stable',
  description: 'slow_change',
  categories: 'stable',
  image_urls: 'slow_change',
  primary_image_url: 'slow_change',
  color: 'stable',
  material: 'stable',
  dimensions: 'stable',
};

export interface FieldFreshness {
  volatility_class: VolatilityClass;
  age_seconds: number;
  decayed: boolean;
  original_confidence?: number;
}

/**
 * Compute decayed confidence for a field based on time since extraction.
 * Formula: base * (0.5 ^ (age / half_life))
 */
export function decayConfidence(baseConfidence: number, fieldName: string, ageSeconds: number): number {
  const volatility = FIELD_VOLATILITY[fieldName] ?? 'slow_change';
  const halfLife = VOLATILITY_HALF_LIFE[volatility];
  return baseConfidence * Math.pow(0.5, ageSeconds / halfLife);
}

/**
 * Build field_freshness block for a set of fields given extraction age.
 */
export function buildFieldFreshness(
  fieldConfidence: Record<string, number>,
  ageSeconds: number,
  decayThreshold: number = 0.01,
): Record<string, FieldFreshness> {
  const freshness: Record<string, FieldFreshness> = {};
  for (const [field, originalConf] of Object.entries(fieldConfidence)) {
    const volatility = FIELD_VOLATILITY[field] ?? 'slow_change';
    const decayed = decayConfidence(originalConf, field, ageSeconds);
    const isDecayed = decayed < originalConf * 0.9; // >10% loss = decayed
    freshness[field] = {
      volatility_class: volatility,
      age_seconds: ageSeconds,
      decayed: isDecayed,
      ...(isDecayed ? { original_confidence: originalConf } : {}),
    };
  }
  return freshness;
}

/**
 * Apply decay to all field confidence values based on extraction age.
 */
export function applyDecay(
  fieldConfidence: Record<string, number>,
  ageSeconds: number,
): Record<string, number> {
  const decayed: Record<string, number> = {};
  for (const [field, conf] of Object.entries(fieldConfidence)) {
    decayed[field] = decayConfidence(conf, field, ageSeconds);
  }
  return decayed;
}

/**
 * Check if any field's decayed confidence falls below a threshold.
 */
export function anyFieldBelowThreshold(
  fieldConfidence: Record<string, number>,
  ageSeconds: number,
  threshold: number,
): boolean {
  for (const [field, conf] of Object.entries(fieldConfidence)) {
    if (decayConfidence(conf, field, ageSeconds) < threshold) return true;
  }
  return false;
}

export interface ShopGraphMetadata {
  source_url: string;
  extraction_timestamp: string;
  response_timestamp: string;
  extraction_method: string;
  data_source: 'live' | 'cache';
  field_confidence: Record<string, number>;
  field_method?: Record<string, ExtractionMethod>;
  field_freshness?: Record<string, FieldFreshness>;
  confidence_method: string;
}

export interface ExtractionStatus {
  status: 'below_threshold' | 'not_available';
  confidence?: number;
  threshold?: number;
  message: string;
}

// ── Credit pricing for execution modes ────────────────────────────
export const CREDIT_MULTIPLIERS = {
  standard: 1,      // Live extraction, no cache
  cache_hit: 0.25,  // Served from cache
  force_refresh: 3, // Explicit cache bypass
  auto_refresh: 2,  // minimum_confidence triggered re-extraction
} as const;

export type CreditMode = keyof typeof CREDIT_MULTIPLIERS;

// ── UCP (Universal Commerce Protocol) types ─────────────────────────

/** UCP item — core product identity within a line_item. */
export interface UcpItem {
  id: string;
  title: string;
  /** Unit price in minor currency units (cents). */
  price: number;
  /** Product image URL (optional). */
  image_url?: string;
}

/** UCP total — cost breakdown entry per UCP spec (total.json). */
export interface UcpTotal {
  type: string;
  amount: number; // signed integer, minor currency units
  display_text?: string;
}

/** UCP line_item — the standard interchange format for product data. */
export interface UcpLineItem {
  /** Line item identifier (server-generated, required in responses). */
  id: string;
  item: UcpItem;
  /** Quantity of the item (always 1 for single-product enrichment). */
  quantity: number;
  /** Line item totals breakdown (required in responses). */
  totals: UcpTotal[];
  /** ShopGraph extraction metadata. */
  _shopgraph?: ShopGraphMetadata;
  /** Fields that were scrubbed or not available. */
  _extraction_status?: Record<string, ExtractionStatus>;
  /** Extended product attributes not in UCP core spec. */
  _extensions?: Record<string, unknown>;
}

// ── Subscription tiers ──────────────────────────────────────────────
export type SubscriptionTier = 'free' | 'starter' | 'growth' | 'enterprise';

export interface TierConfig {
  name: string;
  monthlyLimit: number;
  rateLimit: number; // requests per second
  priceMonthly: number; // cents (0 = free)
}

export const TIER_CONFIGS: Record<SubscriptionTier, TierConfig> = {
  free:       { name: 'Free',       monthlyLimit: 50,     rateLimit: 2,   priceMonthly: 0 },
  starter:    { name: 'Starter',    monthlyLimit: 10_000, rateLimit: 10,  priceMonthly: 9_900 },
  growth:     { name: 'Growth',     monthlyLimit: 50_000, rateLimit: 50,  priceMonthly: 29_900 },
  enterprise: { name: 'Enterprise', monthlyLimit: Infinity, rateLimit: 100, priceMonthly: 0 },
};

export interface Customer {
  id: string;
  email: string;
  stripeCustomerId?: string;
  tier: SubscriptionTier;
  apiKeyHash: string;
  createdAt: string;
}

// ── Test corpus types ──────────────────────────────────────────────

export interface CorpusEntry {
  url: string;
  vertical: string;
  added: string;
  verified?: string;
  segment?: 'b2b' | 'b2c';
  ground_truth?: {
    product_name?: string;
    brand?: string;
    price_amount?: number;
    price_currency?: string;
    availability?: string;
  };
}
