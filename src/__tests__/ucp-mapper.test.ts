import { describe, it, expect } from 'vitest';
import { mapToUcp, validateUcpOutput } from '../ucp-mapper.js';
import type { ProductData } from '../types.js';

/** Build a full ProductData for testing. */
function makeProduct(overrides: Partial<ProductData> = {}): ProductData {
  return {
    url: 'https://example.com/product/123',
    extracted_at: '2026-04-07T12:00:00.000Z',
    extraction_method: 'schema_org',
    product_name: 'Test Widget',
    brand: 'WidgetCo',
    description: 'A fine widget for testing.',
    price: { amount: 29.99, currency: 'USD', sale_price: null },
    availability: 'in_stock',
    categories: ['Widgets', 'Testing'],
    image_urls: ['https://example.com/img1.jpg', 'https://example.com/img2.jpg'],
    primary_image_url: 'https://example.com/img1.jpg',
    color: ['Blue'],
    material: ['Plastic'],
    dimensions: { width: '10cm', height: '5cm' },
    schema_org_raw: null,
    confidence: {
      overall: 0.93,
      per_field: {
        product_name: 0.98,
        brand: 0.93,
        description: 0.88,
        price: 0.93,
        availability: 0.83,
      },
    },
    _shopgraph: {
      source_url: 'https://example.com/product/123',
      extraction_timestamp: '2026-04-07T12:00:00.000Z',
      extraction_method: 'schema_org',
      field_confidence: { product_name: 0.98, brand: 0.93, price: 0.93 },
      confidence_method: 'tier_baseline',
    },
    ...overrides,
  };
}

describe('mapToUcp', () => {
  it('maps full ProductData to valid UCP line_item', () => {
    const product = makeProduct();
    const result = mapToUcp(product);

    expect(result.valid).toBe(true);
    if (!result.valid) return; // type guard

    const li = result.line_item;
    expect(li.id).toMatch(/^li_[a-f0-9]{12}$/); // deterministic hash-based ID
    expect(li.item.id).toBe('https://example.com/product/123');
    expect(li.item.title).toBe('Test Widget');
    expect(li.item.price).toBe(2999); // cents
    expect(li.item.image_url).toBe('https://example.com/img1.jpg');
    expect(li.quantity).toBe(1);
    expect(li.totals).toEqual([{ type: 'subtotal', amount: 2999 }]);
    expect(li._shopgraph).toBeDefined();
    expect(li._shopgraph!.confidence_method).toBe('tier_baseline');

    // Extensions carry extra product data
    expect(li._extensions).toBeDefined();
    expect(li._extensions!.brand).toBe('WidgetCo');
    expect(li._extensions!.currency).toBe('USD');
    expect(li._extensions!.categories).toEqual(['Widgets', 'Testing']);
  });

  it('returns validation error when product_name is missing', () => {
    const product = makeProduct({ product_name: null });
    const result = mapToUcp(product);

    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.missing_fields).toContain('item.title (mapped from product_name)');
  });

  it('returns validation error when price is missing', () => {
    const product = makeProduct({ price: null });
    const result = mapToUcp(product);

    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.missing_fields).toContain('item.price (mapped from price.amount)');
  });

  it('marks optional fields as not_available when empty', () => {
    const product = makeProduct({
      brand: null,
      description: null,
      categories: [],
      color: [],
      material: [],
      dimensions: null,
      availability: 'unknown',
    });
    const result = mapToUcp(product);

    expect(result.valid).toBe(true);
    if (!result.valid) return;

    const status = result.line_item._extraction_status!;
    expect(status.brand.status).toBe('not_available');
    expect(status.description.status).toBe('not_available');
    expect(status.categories.status).toBe('not_available');
    expect(status.color.status).toBe('not_available');
    expect(status.material.status).toBe('not_available');
    expect(status.dimensions.status).toBe('not_available');
    expect(status.availability.status).toBe('not_available');
  });

  it('preserves _extraction_status from threshold scrubbing', () => {
    const product = makeProduct({
      availability: 'unknown',
      description: null,
      _extraction_status: {
        availability: {
          status: 'below_threshold',
          confidence: 0.83,
          threshold: 0.90,
          message: 'Extracted value below confidence threshold. Confidence: 0.83, threshold: 0.90.',
        },
        description: {
          status: 'below_threshold',
          confidence: 0.88,
          threshold: 0.90,
          message: 'Extracted value below confidence threshold. Confidence: 0.88, threshold: 0.90.',
        },
      },
    });

    const result = mapToUcp(product);
    expect(result.valid).toBe(true);
    if (!result.valid) return;

    // Threshold status should be preserved (not overwritten by not_available)
    expect(result.line_item._extraction_status!.availability.status).toBe('below_threshold');
    expect(result.line_item._extraction_status!.description.status).toBe('below_threshold');
  });

  it('does not include image_url when primary_image_url is null', () => {
    const product = makeProduct({ primary_image_url: null, image_urls: [] });
    const result = mapToUcp(product);

    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.line_item.item.image_url).toBeUndefined();
  });
});

describe('validateUcpOutput', () => {
  it('validates a correct line_item', () => {
    const result = validateUcpOutput({
      id: 'li_abc123',
      item: { id: 'x', title: 'Test', price: 100 },
      quantity: 1,
      totals: [{ type: 'subtotal', amount: 100 }],
    });
    expect(result.valid).toBe(true);
    expect(result.missing_fields).toEqual([]);
  });

  it('detects missing id', () => {
    const result = validateUcpOutput({
      id: '',
      item: { id: 'x', title: 'Test', price: 100 },
      quantity: 1,
      totals: [{ type: 'subtotal', amount: 100 }],
    });
    expect(result.valid).toBe(false);
    expect(result.missing_fields).toContain('id');
  });

  it('detects missing item', () => {
    const result = validateUcpOutput({ id: 'li_1', item: undefined as any, quantity: 1, totals: [{ type: 'subtotal', amount: 0 }] });
    expect(result.valid).toBe(false);
    expect(result.missing_fields).toContain('item');
  });

  it('detects missing item fields', () => {
    const result = validateUcpOutput({
      id: 'li_1',
      item: { id: '', title: '', price: null as any },
      quantity: 1,
      totals: [{ type: 'subtotal', amount: 0 }],
    });
    expect(result.valid).toBe(false);
    expect(result.missing_fields).toContain('item.id');
    expect(result.missing_fields).toContain('item.title');
    expect(result.missing_fields).toContain('item.price');
  });

  it('detects missing totals', () => {
    const result = validateUcpOutput({
      id: 'li_1',
      item: { id: 'x', title: 'Test', price: 100 },
      quantity: 1,
      totals: [],
    });
    expect(result.valid).toBe(false);
    expect(result.missing_fields).toContain('totals');
  });

  it('detects invalid quantity', () => {
    const result = validateUcpOutput({
      id: 'li_1',
      item: { id: 'x', title: 'Test', price: 100 },
      quantity: 0,
      totals: [{ type: 'subtotal', amount: 100 }],
    });
    expect(result.valid).toBe(false);
    expect(result.missing_fields).toContain('quantity');
  });
});
