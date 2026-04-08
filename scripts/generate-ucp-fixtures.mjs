import { writeFileSync } from 'node:fs';
import { mapToUcp } from '../dist/ucp-mapper.js';

const products = [
  {
    url: 'https://www.glossier.com/products/boy-brow',
    extracted_at: '2026-04-08T12:00:00Z',
    extraction_method: 'schema_org',
    product_name: 'Boy Brow',
    brand: 'Glossier',
    description: 'Brushable brow wax.',
    price: { amount: 22, currency: 'USD', sale_price: null },
    availability: 'in_stock',
    categories: [],
    image_urls: [],
    primary_image_url: null,
    color: [],
    material: [],
    dimensions: null,
    schema_org_raw: null,
    confidence: { overall: 0.91, per_field: { product_name: 0.98, price: 0.93 } },
    _shopgraph: {
      source_url: 'https://www.glossier.com/products/boy-brow',
      extraction_timestamp: '2026-04-08T12:00:00Z',
      extraction_method: 'schema_org',
      field_confidence: { product_name: 0.98, price: 0.93 },
      confidence_method: 'tier_baseline',
    },
  },
  {
    url: 'https://www.grainger.com/product/DAYTON-Motor-6K778',
    extracted_at: '2026-04-08T12:00:00Z',
    extraction_method: 'llm',
    product_name: 'DAYTON General Purpose Motor 3/4 HP',
    brand: 'DAYTON',
    description: 'General purpose motor for industrial applications.',
    price: { amount: 189.5, currency: 'USD', sale_price: null },
    availability: 'in_stock',
    categories: ['Motors', 'Industrial'],
    image_urls: [],
    primary_image_url: null,
    color: [],
    material: ['Steel'],
    dimensions: null,
    schema_org_raw: null,
    confidence: { overall: 0.72, per_field: { product_name: 0.75, price: 0.7 } },
    _shopgraph: {
      source_url: 'https://www.grainger.com/product/DAYTON-Motor-6K778',
      extraction_timestamp: '2026-04-08T12:00:00Z',
      extraction_method: 'llm',
      field_confidence: { product_name: 0.75, price: 0.7 },
      confidence_method: 'tier_baseline',
    },
  },
];

for (let i = 0; i < products.length; i++) {
  const result = mapToUcp(products[i]);
  if (result.valid) {
    writeFileSync(`/tmp/ucp-output-${i}.json`, JSON.stringify(result.line_item, null, 2));
    console.log(`Generated /tmp/ucp-output-${i}.json`);
  } else {
    console.error(`Mapping failed for product ${i}:`, result.message);
    process.exit(1);
  }
}

console.log('All UCP fixtures generated successfully.');
