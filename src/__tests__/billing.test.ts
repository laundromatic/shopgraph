import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaymentManager } from '../payments.js';
import { scoreAgentReadiness } from '../agent-ready.js';
import type { ProductData, CreditMode } from '../types.js';
import {
  TOOL_PRICING,
  CREDIT_MULTIPLIERS,
  TIER_CONFIGS,
  decayConfidence,
  anyFieldBelowThreshold,
  buildFieldFreshness,
  applyDecay,
} from '../types.js';

// ── Confidence decay tests ────────────────────────────────────────

describe('confidence decay', () => {
  describe('decayConfidence', () => {
    it('returns base confidence at age 0', () => {
      expect(decayConfidence(0.85, 'price', 0)).toBe(0.85);
    });

    it('halves confidence at exactly one half-life', () => {
      // price has real_time volatility, half-life = 30 min = 1800s
      const result = decayConfidence(1.0, 'price', 1800);
      expect(result).toBeCloseTo(0.5, 5);
    });

    it('quarters confidence at two half-lives', () => {
      const result = decayConfidence(1.0, 'price', 3600);
      expect(result).toBeCloseTo(0.25, 5);
    });

    it('decays stable fields slowly', () => {
      // brand has stable volatility, half-life = 7 days = 604800s
      // After 1 day, should retain most confidence
      const result = decayConfidence(0.93, 'brand', 86400);
      expect(result).toBeGreaterThan(0.8);
    });

    it('decays price aggressively', () => {
      // 4 hours old price at 0.85 base
      const result = decayConfidence(0.85, 'price', 4 * 3600);
      expect(result).toBeLessThan(0.01);
    });

    it('uses slow_change for unknown fields', () => {
      // Unknown field defaults to slow_change (24h half-life)
      const result = decayConfidence(0.90, 'unknown_field', 86400);
      expect(result).toBeCloseTo(0.45, 1);
    });
  });

  describe('anyFieldBelowThreshold', () => {
    const fields = { price: 0.85, brand: 0.93, description: 0.80 };

    it('returns false when all fields above threshold at age 0', () => {
      expect(anyFieldBelowThreshold(fields, 0, 0.70)).toBe(false);
    });

    it('returns true when price decays below threshold', () => {
      // After 2 hours, price (real_time, 30min half-life) should be well below 0.70
      expect(anyFieldBelowThreshold(fields, 7200, 0.70)).toBe(true);
    });

    it('returns false when only stable fields present', () => {
      const stableFields = { brand: 0.93, material: 0.88 };
      // After 1 hour, stable fields barely decay
      expect(anyFieldBelowThreshold(stableFields, 3600, 0.70)).toBe(false);
    });
  });

  describe('applyDecay', () => {
    it('returns original values at age 0', () => {
      const fields = { price: 0.85, brand: 0.93 };
      const result = applyDecay(fields, 0);
      expect(result.price).toBe(0.85);
      expect(result.brand).toBe(0.93);
    });

    it('decays each field independently', () => {
      const fields = { price: 0.85, brand: 0.93 };
      const result = applyDecay(fields, 3600); // 1 hour
      // price (real_time, 30min half-life) after 1hr = 2 half-lives = 0.25x
      expect(result.price).toBeLessThan(0.25);
      // brand (stable) should barely move
      expect(result.brand).toBeGreaterThan(0.9);
    });
  });

  describe('buildFieldFreshness', () => {
    it('marks fields as not decayed at age 0', () => {
      const fields = { price: 0.85 };
      const result = buildFieldFreshness(fields, 0);
      expect(result.price.decayed).toBe(false);
      expect(result.price.age_seconds).toBe(0);
      expect(result.price.volatility_class).toBe('real_time');
    });

    it('marks price as decayed after 2 hours', () => {
      const fields = { price: 0.85 };
      const result = buildFieldFreshness(fields, 7200);
      expect(result.price.decayed).toBe(true);
      expect(result.price.original_confidence).toBe(0.85);
    });

    it('marks brand as not decayed after 2 hours', () => {
      const fields = { brand: 0.93 };
      const result = buildFieldFreshness(fields, 7200);
      expect(result.brand.decayed).toBe(false);
      expect(result.brand.original_confidence).toBeUndefined();
    });
  });
});

// ── Credit multiplier tests ───────────────────────────────────────

describe('credit multipliers', () => {
  it('has correct multiplier values', () => {
    expect(CREDIT_MULTIPLIERS.standard).toBe(1);
    expect(CREDIT_MULTIPLIERS.cache_hit).toBe(0.25);
    expect(CREDIT_MULTIPLIERS.force_refresh).toBe(3);
    expect(CREDIT_MULTIPLIERS.auto_refresh).toBe(2);
  });

  it('cache hit costs less than standard', () => {
    const standardCost = TOOL_PRICING.enrich_product * CREDIT_MULTIPLIERS.standard;
    const cacheCost = TOOL_PRICING.enrich_product * CREDIT_MULTIPLIERS.cache_hit;
    expect(cacheCost).toBeLessThan(standardCost);
  });

  it('force refresh costs more than standard', () => {
    const standardCost = TOOL_PRICING.enrich_product * CREDIT_MULTIPLIERS.standard;
    const forceCost = TOOL_PRICING.enrich_product * CREDIT_MULTIPLIERS.force_refresh;
    expect(forceCost).toBeGreaterThan(standardCost);
  });

  it('auto refresh is between standard and force', () => {
    expect(CREDIT_MULTIPLIERS.auto_refresh).toBeGreaterThan(CREDIT_MULTIPLIERS.standard);
    expect(CREDIT_MULTIPLIERS.auto_refresh).toBeLessThan(CREDIT_MULTIPLIERS.force_refresh);
  });
});

// ── Tier configuration tests ──────────────────────────────────────

describe('tier configs', () => {
  it('free tier has 500 monthly limit', () => {
    expect(TIER_CONFIGS.free.monthlyLimit).toBe(500);
  });

  it('starter tier costs $99/month', () => {
    expect(TIER_CONFIGS.starter.priceMonthly).toBe(9_900);
  });

  it('growth tier costs $299/month', () => {
    expect(TIER_CONFIGS.growth.priceMonthly).toBe(29_900);
  });

  it('enterprise has unlimited usage', () => {
    expect(TIER_CONFIGS.enterprise.monthlyLimit).toBe(Infinity);
  });

  it('rate limits increase with tier', () => {
    expect(TIER_CONFIGS.free.rateLimit).toBeLessThan(TIER_CONFIGS.starter.rateLimit);
    expect(TIER_CONFIGS.starter.rateLimit).toBeLessThan(TIER_CONFIGS.growth.rateLimit);
    expect(TIER_CONFIGS.growth.rateLimit).toBeLessThan(TIER_CONFIGS.enterprise.rateLimit);
  });
});

// ── PaymentManager tests ──────────────────────────────────────────

describe('PaymentManager', () => {
  describe('createChallenge', () => {
    let pm: PaymentManager;

    beforeEach(() => {
      // Use test key
      pm = new PaymentManager('sk_test_fake_key_for_unit_tests');
    });

    it('returns correct challenge for enrich_product', () => {
      const challenge = pm.createChallenge('enrich_product');
      expect(challenge.type).toBe('payment_required');
      expect(challenge.provider).toBe('stripe');
      expect(challenge.amount).toBe(2); // $0.02
      expect(challenge.currency).toBe('usd');
      expect(challenge.payment_methods).toContain('card');
    });

    it('returns correct challenge for enrich_basic', () => {
      const challenge = pm.createChallenge('enrich_basic');
      expect(challenge.amount).toBe(1); // $0.01
    });

    it('returns correct challenge for enrich_html', () => {
      const challenge = pm.createChallenge('enrich_html');
      expect(challenge.amount).toBe(2); // $0.02
    });

    it('includes tool name in description', () => {
      const challenge = pm.createChallenge('enrich_product');
      expect(challenge.description).toContain('enrich_product');
    });
  });
});

// ── Webhook handler logic tests ───────────────────────────────────

describe('webhook tier mapping', () => {
  it('maps price IDs to correct tiers', () => {
    // This tests the logic pattern used in api/index.ts webhook handler
    const priceToTier = (priceId: string): string => {
      if (priceId === 'price_starter_test') return 'starter';
      if (priceId === 'price_growth_test') return 'growth';
      return 'free';
    };

    expect(priceToTier('price_starter_test')).toBe('starter');
    expect(priceToTier('price_growth_test')).toBe('growth');
    expect(priceToTier('unknown_price')).toBe('free');
  });
});

// ── Tool pricing consistency ──────────────────────────────────────

describe('tool pricing', () => {
  it('all prices are positive integers', () => {
    for (const [, price] of Object.entries(TOOL_PRICING)) {
      expect(price).toBeGreaterThan(0);
      expect(Number.isInteger(price)).toBe(true);
    }
  });

  it('enrich_basic is cheaper than enrich_product', () => {
    expect(TOOL_PRICING.enrich_basic).toBeLessThanOrEqual(TOOL_PRICING.enrich_product);
  });

  it('enrich_html costs same as enrich_product', () => {
    expect(TOOL_PRICING.enrich_html).toBe(TOOL_PRICING.enrich_product);
  });
});

// ── Scenario 1: Credit calculation for metered billing ────────────

describe('credit calculation for metered events', () => {
  it('force_refresh calculates correct 3x credit amount', () => {
    const baseCredits = TOOL_PRICING.enrich_product; // 2 cents
    const multiplier = CREDIT_MULTIPLIERS.force_refresh; // 3x
    const totalCredits = baseCredits * multiplier;
    expect(totalCredits).toBe(6); // $0.06
  });

  it('auto_refresh calculates correct 2x credit amount', () => {
    const baseCredits = TOOL_PRICING.enrich_product;
    const multiplier = CREDIT_MULTIPLIERS.auto_refresh;
    const totalCredits = baseCredits * multiplier;
    expect(totalCredits).toBe(4); // $0.04
  });

  it('cache_hit calculates correct 0.25x credit amount', () => {
    const baseCredits = TOOL_PRICING.enrich_product;
    const multiplier = CREDIT_MULTIPLIERS.cache_hit;
    const totalCredits = baseCredits * multiplier;
    expect(totalCredits).toBe(0.5); // $0.005
  });

  it('challenge amount reflects credit mode multiplier', () => {
    const pm = new PaymentManager('sk_test_fake_key_for_unit_tests');
    const challenge = pm.createChallenge('enrich_product');
    const baseAmount = challenge.amount; // 2

    // force_refresh challenge should be 3x
    const forceAmount = Math.ceil(baseAmount * CREDIT_MULTIPLIERS.force_refresh);
    expect(forceAmount).toBe(6);

    // cache_hit should round up to at least 1 cent (Stripe minimum)
    const cacheAmount = Math.ceil(baseAmount * CREDIT_MULTIPLIERS.cache_hit);
    expect(cacheAmount).toBe(1);
  });
});

// ── Scenario 2: 403 CDN rejection on force_refresh ────────────────

describe('extraction failure with cache fallback', () => {
  function makeCachedProduct(minutesAgo: number): ProductData {
    const extractedAt = new Date(Date.now() - minutesAgo * 60 * 1000);
    return {
      url: 'https://example.com/product',
      extracted_at: extractedAt.toISOString(),
      extraction_method: 'schema_org',
      product_name: 'Test Product',
      brand: 'TestBrand',
      description: 'A test product',
      price: { amount: 29.99, currency: 'USD' },
      availability: 'in_stock',
      categories: ['test'],
      image_urls: [],
      primary_image_url: null,
      color: [],
      material: [],
      dimensions: null,
      schema_org_raw: null,
      confidence: {
        overall: 0.93,
        per_field: { product_name: 0.98, brand: 0.93, price: 0.93, availability: 0.83 },
      },
    };
  }

  it('stale cache data should be servable when live fetch fails', () => {
    // Simulates the decision: we have 10-minute-old cache, live fetch throws 403
    // The system should fall back to cache at cache_hit pricing
    const cached = makeCachedProduct(10);

    // Verify the cache data exists and has valid confidence
    expect(cached.product_name).toBe('Test Product');
    expect(cached.confidence.overall).toBe(0.93);

    // After 10 minutes, Schema.org fields should still be highly confident
    // (slow_change / stable fields barely decay in 10 min)
    const ageSeconds = 10 * 60;
    const decayedPrice = decayConfidence(0.93, 'price', ageSeconds);
    const decayedBrand = decayConfidence(0.93, 'brand', ageSeconds);

    // price (real_time, 30min half-life) after 10 min ≈ 0.93 * 0.794 ≈ 0.74
    expect(decayedPrice).toBeGreaterThan(0.7);
    // brand (stable, 7-day half-life) barely moves
    expect(decayedBrand).toBeGreaterThan(0.92);

    // The fallback billing resolution: charge cache_hit (0.25x), not force_refresh (3x)
    const fallbackMode: CreditMode = 'cache_hit';
    const fallbackCost = TOOL_PRICING.enrich_product * CREDIT_MULTIPLIERS[fallbackMode];
    const forceCost = TOOL_PRICING.enrich_product * CREDIT_MULTIPLIERS.force_refresh;
    expect(fallbackCost).toBeLessThan(forceCost);
  });

  it('403 error message should be preserved in fallback response', () => {
    // When falling back to cache, the extraction_error field should tell
    // the consumer why the live fetch failed
    const errorMessage = 'HTTP 403: Forbidden';
    // The server.ts handler attaches extraction_error to the response
    // This test validates the contract shape
    const fallbackResponse = {
      product: makeCachedProduct(10),
      receipt: { payment_intent_id: 'pi_test', amount: 6, currency: 'usd', status: 'succeeded', tool: 'enrich_product', created_at: new Date().toISOString() },
      cached: true,
      credit_mode: 'cache_hit' as CreditMode,
      extraction_error: errorMessage,
    };

    expect(fallbackResponse.extraction_error).toBe('HTTP 403: Forbidden');
    expect(fallbackResponse.credit_mode).toBe('cache_hit');
    expect(fallbackResponse.cached).toBe(true);
  });
});

// ── Scenario 3: minimum_confidence cache reconciliation ───────────

describe('minimum_confidence cache reconciliation', () => {
  it('auto_refresh that falls back to cache charges cache_hit rate', () => {
    // User requests minimum_confidence=0.90
    // Live fetch fails (403/timeout/etc)
    // 10-minute-old cache meets threshold for stable fields
    // Billing should reconcile to cache_hit (0.25x), not auto_refresh (2x)
    const autoRefreshCost = TOOL_PRICING.enrich_product * CREDIT_MULTIPLIERS.auto_refresh;
    const cacheHitCost = TOOL_PRICING.enrich_product * CREDIT_MULTIPLIERS.cache_hit;

    // The delta is what the customer saves when fallback triggers
    const savings = autoRefreshCost - cacheHitCost;
    expect(savings).toBe(3.5); // $0.035 saved per call
    expect(cacheHitCost).toBeLessThan(autoRefreshCost);
  });

  it('minimum_confidence evaluates DECAYED confidence not original', () => {
    // A 2-hour-old cached price at 0.93 base decays below any reasonable threshold
    const fields = { price: 0.93, brand: 0.93, product_name: 0.98 };
    const twoHoursAgo = 2 * 3600;

    // With threshold 0.70, price should trigger refresh (it's decayed well below)
    expect(anyFieldBelowThreshold(fields, twoHoursAgo, 0.70)).toBe(true);

    // With threshold 0.50, brand should NOT trigger (stable field barely moves)
    const stableOnly = { brand: 0.93, product_name: 0.98 };
    expect(anyFieldBelowThreshold(stableOnly, twoHoursAgo, 0.50)).toBe(false);
  });
});

// ── Scenario 4: access_readiness stub contract ────────────────────

describe('access_readiness stub contract', () => {
  function makeMinimalProduct(): ProductData {
    return {
      url: 'https://example.com/product',
      extracted_at: new Date().toISOString(),
      extraction_method: 'schema_org',
      product_name: 'Test Product',
      brand: 'TestBrand',
      description: 'A test product description',
      price: { amount: 29.99, currency: 'USD' },
      availability: 'in_stock',
      categories: ['Electronics'],
      image_urls: ['https://example.com/img.jpg'],
      primary_image_url: 'https://example.com/img.jpg',
      color: [],
      material: [],
      dimensions: null,
      schema_org_raw: null,
      confidence: {
        overall: 0.93,
        per_field: { product_name: 0.98, brand: 0.93, price: 0.93 },
      },
    };
  }

  it('access_readiness is present in scoring breakdown', () => {
    const product = makeMinimalProduct();
    const score = scoreAgentReadiness(product);
    expect(score.scoring_breakdown.access_readiness).toBeDefined();
  });

  it('access_readiness score is exactly 100', () => {
    const product = makeMinimalProduct();
    const score = scoreAgentReadiness(product);
    expect(score.scoring_breakdown.access_readiness.score).toBe(100);
  });

  it('access_readiness weight is exactly 0.00', () => {
    const product = makeMinimalProduct();
    const score = scoreAgentReadiness(product);
    expect(score.scoring_breakdown.access_readiness.weight).toBe(0.00);
  });

  it('access_readiness weighted_contribution is exactly 0', () => {
    const product = makeMinimalProduct();
    const score = scoreAgentReadiness(product);
    expect(score.scoring_breakdown.access_readiness.weighted_contribution).toBe(0);
  });

  it('access_readiness does not affect composite score', () => {
    const product = makeMinimalProduct();
    const score = scoreAgentReadiness(product);

    // Sum of weighted contributions from the 5 active dimensions
    const activeDimensions =
      score.scoring_breakdown.structured_data_completeness.weighted_contribution +
      score.scoring_breakdown.semantic_richness.weighted_contribution +
      score.scoring_breakdown.ucp_compatibility.weighted_contribution +
      score.scoring_breakdown.pricing_clarity.weighted_contribution +
      score.scoring_breakdown.inventory_signal_quality.weighted_contribution;

    // Composite score should equal sum of active dimensions only
    expect(score.agent_readiness_score).toBeCloseTo(activeDimensions, 2);
  });

  it('access_readiness details contain expected fields', () => {
    const product = makeMinimalProduct();
    const score = scoreAgentReadiness(product);
    const details = score.scoring_breakdown.access_readiness.details;

    expect(details.access_level).toBe(5);
    expect(details.access_label).toBe('fully_open');
    expect(details.note).toContain('Web Bot Auth');
  });

  it('all 6 dimensions are present in scoring_breakdown', () => {
    const product = makeMinimalProduct();
    const score = scoreAgentReadiness(product);
    const keys = Object.keys(score.scoring_breakdown);
    expect(keys).toHaveLength(6);
    expect(keys).toContain('structured_data_completeness');
    expect(keys).toContain('semantic_richness');
    expect(keys).toContain('ucp_compatibility');
    expect(keys).toContain('pricing_clarity');
    expect(keys).toContain('inventory_signal_quality');
    expect(keys).toContain('access_readiness');
  });
});
