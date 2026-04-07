import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  extractSchemaOrg,
  parseJsonLdBlocks,
  findProductSchema,
  extractAvailability,
} from '../schema-org.js';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const shopifyHtml = readFileSync(join(FIXTURES, 'shopify-product.html'), 'utf-8');
const amazonHtml = readFileSync(join(FIXTURES, 'amazon-product.html'), 'utf-8');
const noSchemaHtml = readFileSync(join(FIXTURES, 'no-schema-product.html'), 'utf-8');

describe('parseJsonLdBlocks', () => {
  it('extracts JSON-LD blocks from HTML', () => {
    const blocks = parseJsonLdBlocks(shopifyHtml);
    expect(blocks.length).toBe(1);
    expect((blocks[0] as Record<string, unknown>)['@type']).toBe('Product');
  });

  it('returns empty array when no JSON-LD exists', () => {
    const blocks = parseJsonLdBlocks(noSchemaHtml);
    expect(blocks).toEqual([]);
  });

  it('handles invalid JSON gracefully', () => {
    const html = '<script type="application/ld+json">{invalid json}</script>';
    const blocks = parseJsonLdBlocks(html);
    expect(blocks).toEqual([]);
  });

  it('handles array JSON-LD blocks', () => {
    const html = `<script type="application/ld+json">[
      {"@type": "Product", "name": "A"},
      {"@type": "BreadcrumbList"}
    ]</script>`;
    const blocks = parseJsonLdBlocks(html);
    expect(blocks.length).toBe(2);
  });

  it('handles multiple JSON-LD script tags', () => {
    const html = `
      <script type="application/ld+json">{"@type": "Product", "name": "A"}</script>
      <script type="application/ld+json">{"@type": "Organization", "name": "B"}</script>
    `;
    const blocks = parseJsonLdBlocks(html);
    expect(blocks.length).toBe(2);
  });
});

describe('findProductSchema', () => {
  it('finds direct Product type', () => {
    const blocks = [{ '@type': 'Product', name: 'Test' }];
    const product = findProductSchema(blocks);
    expect(product).toBeTruthy();
    expect(product!.name).toBe('Test');
  });

  it('finds Product in @graph', () => {
    const blocks = [{
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebPage' },
        { '@type': 'Product', name: 'Graph Product' },
      ],
    }];
    const product = findProductSchema(blocks);
    expect(product!.name).toBe('Graph Product');
  });

  it('finds Product via ItemPage mainEntity', () => {
    const blocks = [{
      '@type': 'ItemPage',
      mainEntity: { '@type': 'Product', name: 'Nested Product' },
    }];
    const product = findProductSchema(blocks);
    expect(product!.name).toBe('Nested Product');
  });

  it('returns null when no Product found', () => {
    const blocks = [{ '@type': 'Organization', name: 'Corp' }];
    expect(findProductSchema(blocks)).toBeNull();
  });

  it('handles IndividualProduct type', () => {
    const blocks = [{ '@type': 'IndividualProduct', name: 'Individual' }];
    const product = findProductSchema(blocks);
    expect(product!.name).toBe('Individual');
  });
});

describe('extractSchemaOrg', () => {
  it('extracts all fields from Shopify product', () => {
    const result = extractSchemaOrg(shopifyHtml);
    expect(result).not.toBeNull();
    expect(result!.product_name).toBe('Vintage Rose Gold Ring');
    expect(result!.brand).toBe('Elegance Jewelry');
    expect(result!.description).toContain('vintage-inspired');
    expect(result!.price).toEqual({
      amount: 89.99,
      currency: 'USD',
      sale_price: null,
    });
    expect(result!.availability).toBe('in_stock');
    expect(result!.image_urls).toHaveLength(3);
    expect(result!.primary_image_url).toBe('https://cdn.elegancejewelry.com/ring-front.jpg');
    expect(result!.color).toEqual(['Rose Gold']);
    expect(result!.material).toEqual(['Gold Plated', 'Cubic Zirconia']);
    expect(result!.extraction_method).toBe('schema_org');
  });

  it('handles AggregateOffer from Amazon-style page', () => {
    const result = extractSchemaOrg(amazonHtml);
    expect(result).not.toBeNull();
    expect(result!.product_name).toBe('TechSound Pro Wireless Headphones');
    expect(result!.price!.amount).toBe(149.99);
    expect(result!.price!.currency).toBe('USD');
    expect(result!.color).toEqual(['Black', 'Silver', 'Midnight Blue']);
  });

  it('handles ImageObject format', () => {
    const result = extractSchemaOrg(amazonHtml);
    expect(result!.image_urls).toContain('https://images.example.com/headphones-main.jpg');
  });

  it('returns null for pages without JSON-LD', () => {
    const result = extractSchemaOrg(noSchemaHtml);
    expect(result).toBeNull();
  });

  it('parses categories from > separated string', () => {
    const result = extractSchemaOrg(shopifyHtml);
    expect(result!.categories).toEqual(['Jewelry', 'Rings', 'Gold Rings']);
  });

  it('parses categories from array', () => {
    const result = extractSchemaOrg(amazonHtml);
    expect(result!.categories).toEqual(['Electronics', 'Headphones', 'Wireless Audio']);
  });

  it('has high confidence for schema.org fields with per-field modifiers', () => {
    const result = extractSchemaOrg(shopifyHtml);
    expect(result!.confidence.overall).toBeGreaterThan(0.85);
    // SCHEMA_ORG_BASELINE=0.93 + per-field modifiers
    expect(result!.confidence.per_field.product_name).toBeCloseTo(0.98, 10); // 0.93 + 0.05
    expect(result!.confidence.per_field.price).toBeCloseTo(0.93, 10);        // 0.93 + 0.00
    expect(result!.confidence.per_field.description).toBeCloseTo(0.88, 10);  // 0.93 - 0.05
    expect(result!.confidence.per_field.availability).toBeCloseTo(0.83, 10); // 0.93 - 0.10
    expect(result!.confidence.per_field.brand).toBeCloseTo(0.93, 10);        // 0.93 + 0.00
  });

  it('handles string brand (not object)', () => {
    const html = `<script type="application/ld+json">
      {"@type": "Product", "name": "Test", "brand": "SimpleBrand"}
    </script>`;
    const result = extractSchemaOrg(html);
    expect(result!.brand).toBe('SimpleBrand');
  });
});

describe('extractAvailability', () => {
  it('recognizes InStock', () => {
    expect(extractAvailability({ offers: { availability: 'https://schema.org/InStock' } })).toBe('in_stock');
  });

  it('recognizes OutOfStock', () => {
    expect(extractAvailability({ offers: { availability: 'https://schema.org/OutOfStock' } })).toBe('out_of_stock');
  });

  it('recognizes PreOrder', () => {
    expect(extractAvailability({ offers: { availability: 'https://schema.org/PreOrder' } })).toBe('preorder');
  });

  it('returns unknown for missing availability', () => {
    expect(extractAvailability({ offers: {} })).toBe('unknown');
  });

  it('returns unknown when no offers', () => {
    expect(extractAvailability({})).toBe('unknown');
  });
});
