import { describe, it, expect } from 'vitest';
import {
  getVolatilityClass,
  normaliseDomain,
  PROMO_HEAVY_DOMAINS_VIEW,
} from '../volatility-profile.js';

describe('normaliseDomain', () => {
  it('strips protocol and path from full URLs', () => {
    expect(normaliseDomain('https://www.etsy.com/listing/123/abc')).toBe('etsy.com');
    expect(normaliseDomain('http://etsy.com')).toBe('etsy.com');
  });

  it('strips www prefix', () => {
    expect(normaliseDomain('www.ebay.com')).toBe('ebay.com');
  });

  it('reduces subdomains to eTLD+1', () => {
    expect(normaliseDomain('shop.etsy.com')).toBe('etsy.com');
    expect(normaliseDomain('deals.aliexpress.com')).toBe('aliexpress.com');
  });

  it('lowercases input', () => {
    expect(normaliseDomain('ETSY.com')).toBe('etsy.com');
    expect(normaliseDomain('TEMU.COM')).toBe('temu.com');
  });

  it('returns null for empty input', () => {
    expect(normaliseDomain('')).toBeNull();
  });

  it('passes through unparseable single-segment strings unchanged', () => {
    // Non-URL strings fall through to the split-on-dots branch and remain
    // unchanged. They won't match the promo-heavy seed so getVolatilityClass
    // returns defaults — acceptable behaviour.
    expect(normaliseDomain('localhost')).toBe('localhost');
  });
});

describe('getVolatilityClass (LAU-330 per-merchant volatility lookup)', () => {
  it('routes promo-heavy domain + price to hyper_volatile', () => {
    expect(getVolatilityClass('https://www.etsy.com/listing/123', 'price')).toBe('hyper_volatile');
    expect(getVolatilityClass('ebay.com', 'price')).toBe('hyper_volatile');
    expect(getVolatilityClass('https://aliexpress.com', 'price')).toBe('hyper_volatile');
    expect(getVolatilityClass('temu.com', 'price')).toBe('hyper_volatile');
    expect(getVolatilityClass('shein.com', 'price')).toBe('hyper_volatile');
  });

  it('routes promo-heavy domain + availability to hyper_volatile', () => {
    expect(getVolatilityClass('https://www.etsy.com/listing/123', 'availability')).toBe('hyper_volatile');
    expect(getVolatilityClass('ebay.com', 'availability')).toBe('hyper_volatile');
  });

  it('does NOT override stable fields even on promo-heavy domains', () => {
    // brand is 'stable' by default; promo-heavy override is field-scoped.
    expect(getVolatilityClass('etsy.com', 'brand')).toBe('stable');
    // product_name is 'slow_change' by default.
    expect(getVolatilityClass('temu.com', 'product_name')).toBe('slow_change');
  });

  it('returns FIELD_VOLATILITY default for non-promo-heavy domains', () => {
    expect(getVolatilityClass('https://example.com/product/1', 'price')).toBe('real_time');
    expect(getVolatilityClass('shop.example.com', 'availability')).toBe('real_time');
    expect(getVolatilityClass('macys.com', 'brand')).toBe('stable');
  });

  it('returns slow_change for unknown fields on unknown domains', () => {
    expect(getVolatilityClass('example.com', 'some_made_up_field')).toBe('slow_change');
  });

  it('handles missing / empty domain by falling back to defaults', () => {
    expect(getVolatilityClass('', 'price')).toBe('real_time');
  });

  it('exposes the seed list for introspection', () => {
    expect(PROMO_HEAVY_DOMAINS_VIEW.size).toBeGreaterThanOrEqual(3);
    expect(PROMO_HEAVY_DOMAINS_VIEW.has('etsy.com')).toBe(true);
  });
});
