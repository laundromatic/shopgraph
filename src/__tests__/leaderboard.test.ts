import { describe, it, expect } from 'vitest';
import { extractDomain, isProductUrl } from '../leaderboard.js';

describe('extractDomain', () => {
  it('strips www prefix', () => {
    expect(extractDomain('https://www.moglix.com/product/123')).toBe('moglix.com');
  });

  it('handles subdomains', () => {
    expect(extractDomain('https://shop.bowersmedical.com/products/gloves')).toBe('shop.bowersmedical.com');
  });

  it('lowercases', () => {
    expect(extractDomain('https://WWW.ULINE.COM/Product/Detail')).toBe('uline.com');
  });

  it('returns empty for invalid URL', () => {
    expect(extractDomain('not-a-url')).toBe('');
  });
});

describe('isProductUrl', () => {
  it('accepts product pages', () => {
    expect(isProductUrl('https://www.moglix.com/product/123').valid).toBe(true);
    expect(isProductUrl('https://www.uline.com/Product/Detail/S-19318').valid).toBe(true);
    expect(isProductUrl('https://example.com/p/widget').valid).toBe(true);
  });

  it('rejects homepages', () => {
    expect(isProductUrl('https://www.moglix.com/').valid).toBe(false);
  });

  it('rejects search results', () => {
    expect(isProductUrl('https://example.com/search?q=widget').valid).toBe(false);
  });

  it('rejects cart/checkout', () => {
    expect(isProductUrl('https://example.com/cart').valid).toBe(false);
    expect(isProductUrl('https://example.com/checkout/step1').valid).toBe(false);
  });

  it('rejects help/about/blog', () => {
    expect(isProductUrl('https://example.com/about').valid).toBe(false);
    expect(isProductUrl('https://example.com/blog/post-1').valid).toBe(false);
  });

  it('accepts collections with product path', () => {
    // /collections/foo/products/bar is a Shopify product URL
    expect(isProductUrl('https://example.com/collections/shoes/products/runner').valid).toBe(true);
  });
});
