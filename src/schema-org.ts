import type { ProductData, PriceData } from './types.js';
import { SCHEMA_ORG_BASELINE, getFieldConfidence } from './types.js';

/**
 * Extract Product data from JSON-LD blocks in HTML.
 */
export function extractSchemaOrg(html: string): Partial<ProductData> | null {
  const jsonLdBlocks = parseJsonLdBlocks(html);
  if (jsonLdBlocks.length === 0) return null;

  const product = findProductSchema(jsonLdBlocks);
  if (!product) return null;

  const perField: Record<string, number> = {};
  const setField = (name: string, value: unknown): boolean => {
    if (value !== null && value !== undefined && value !== '') {
      perField[name] = getFieldConfidence(SCHEMA_ORG_BASELINE, name);
      return true;
    }
    return false;
  };

  const productName = extractString(product.name);
  setField('product_name', productName);

  const brand = extractBrand(product);
  setField('brand', brand);

  const description = extractString(product.description);
  setField('description', description);

  const price = extractPrice(product);
  if (price) setField('price', price);

  const availability = extractAvailability(product);
  setField('availability', availability);

  const imageUrls = extractImages(product);
  if (imageUrls.length > 0) setField('image_urls', imageUrls);

  const categories = extractCategories(product);
  if (categories.length > 0) setField('categories', categories);

  const color = extractArrayField(product, 'color');
  if (color.length > 0) setField('color', color);

  const material = extractArrayField(product, 'material');
  if (material.length > 0) setField('material', material);

  const fieldCount = Object.keys(perField).length;
  const overall = fieldCount > 0
    ? Object.values(perField).reduce((a, b) => a + b, 0) / fieldCount
    : 0;

  return {
    extraction_method: 'schema_org',
    product_name: productName,
    brand,
    description,
    price,
    availability: availability !== 'unknown' ? availability : 'unknown',
    categories,
    image_urls: imageUrls,
    primary_image_url: imageUrls[0] ?? null,
    color,
    material,
    dimensions: null,
    schema_org_raw: product as Record<string, unknown>,
    confidence: { overall, per_field: perField },
  };
}

/**
 * Parse all JSON-LD script blocks from HTML.
 */
export function parseJsonLdBlocks(html: string): unknown[] {
  const results: unknown[] = [];
  const regex = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (Array.isArray(parsed)) {
        results.push(...parsed);
      } else {
        results.push(parsed);
      }
    } catch {
      // Skip invalid JSON-LD blocks
    }
  }

  return results;
}

/**
 * Find Product type schema from parsed JSON-LD blocks.
 * Handles @graph, nested ItemPage, and direct Product.
 */
export function findProductSchema(blocks: unknown[]): Record<string, unknown> | null {
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    const obj = block as Record<string, unknown>;

    // Direct Product type
    if (isProductType(obj)) return obj;

    // @graph array
    if (Array.isArray(obj['@graph'])) {
      for (const item of obj['@graph']) {
        if (item && typeof item === 'object' && isProductType(item as Record<string, unknown>)) {
          return item as Record<string, unknown>;
        }
      }
    }

    // ItemPage with mainEntity
    if (getType(obj) === 'ItemPage' && obj.mainEntity) {
      const entity = obj.mainEntity as Record<string, unknown>;
      if (isProductType(entity)) return entity;
    }
  }
  return null;
}

function getType(obj: Record<string, unknown>): string {
  const type = obj['@type'];
  if (typeof type === 'string') return type;
  if (Array.isArray(type)) return type[0] as string;
  return '';
}

function isProductType(obj: Record<string, unknown>): boolean {
  const type = getType(obj);
  return type === 'Product' || type === 'IndividualProduct' || type === 'ProductModel';
}

function extractString(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'object' && value !== null && '@value' in (value as Record<string, unknown>)) {
    return extractString((value as Record<string, unknown>)['@value']);
  }
  return null;
}

function extractBrand(product: Record<string, unknown>): string | null {
  const brand = product.brand;
  if (typeof brand === 'string') return brand.trim() || null;
  if (brand && typeof brand === 'object') {
    const brandObj = brand as Record<string, unknown>;
    return extractString(brandObj.name) ?? extractString(brandObj['@id']);
  }
  return null;
}

function extractPrice(product: Record<string, unknown>): PriceData | null {
  const offers = product.offers;
  if (!offers) return null;

  // Single Offer
  if (typeof offers === 'object' && !Array.isArray(offers)) {
    return extractPriceFromOffer(offers as Record<string, unknown>);
  }

  // Array of offers — take the first
  if (Array.isArray(offers) && offers.length > 0) {
    return extractPriceFromOffer(offers[0] as Record<string, unknown>);
  }

  return null;
}

function extractPriceFromOffer(offer: Record<string, unknown>): PriceData | null {
  const type = getType(offer);

  if (type === 'AggregateOffer') {
    const lowPrice = parseFloat(String(offer.lowPrice ?? offer.price ?? ''));
    const highPrice = parseFloat(String(offer.highPrice ?? ''));
    return {
      amount: isNaN(lowPrice) ? null : lowPrice,
      currency: extractString(offer.priceCurrency as string) ?? null,
      sale_price: !isNaN(highPrice) && highPrice !== lowPrice ? lowPrice : null,
    };
  }

  const price = parseFloat(String(offer.price ?? ''));
  const salePrice = offer.salePrice ? parseFloat(String(offer.salePrice)) : null;

  return {
    amount: isNaN(price) ? null : price,
    currency: extractString(offer.priceCurrency as string) ?? null,
    sale_price: salePrice !== null && !isNaN(salePrice) ? salePrice : null,
  };
}

export function extractAvailability(product: Record<string, unknown>): ProductData['availability'] {
  const offers = product.offers;
  if (!offers) return 'unknown';

  const offer = Array.isArray(offers) ? offers[0] : offers;
  if (!offer || typeof offer !== 'object') return 'unknown';

  const avail = (offer as Record<string, unknown>).availability;
  if (!avail) return 'unknown';

  const availStr = String(avail).toLowerCase();

  if (availStr.includes('instock') || availStr.includes('in_stock') || availStr.includes('limitedavailability')) {
    return 'in_stock';
  }
  if (availStr.includes('outofstock') || availStr.includes('out_of_stock') || availStr.includes('soldout')) {
    return 'out_of_stock';
  }
  if (availStr.includes('preorder') || availStr.includes('pre_order') || availStr.includes('presale')) {
    return 'preorder';
  }

  return 'unknown';
}

function extractImages(product: Record<string, unknown>): string[] {
  const images: string[] = [];
  const imageField = product.image;

  if (!imageField) return images;

  if (typeof imageField === 'string') {
    images.push(imageField);
  } else if (Array.isArray(imageField)) {
    for (const img of imageField) {
      if (typeof img === 'string') {
        images.push(img);
      } else if (img && typeof img === 'object') {
        const imgObj = img as Record<string, unknown>;
        const url = extractString(imgObj.url ?? imgObj.contentUrl ?? imgObj['@id']);
        if (url) images.push(url);
      }
    }
  } else if (typeof imageField === 'object') {
    const imgObj = imageField as Record<string, unknown>;
    const url = extractString(imgObj.url ?? imgObj.contentUrl ?? imgObj['@id']);
    if (url) images.push(url);
  }

  return images;
}

function extractCategories(product: Record<string, unknown>): string[] {
  const cat = product.category;
  if (!cat) return [];
  if (typeof cat === 'string') return cat.split('>').map(s => s.trim()).filter(Boolean);
  if (Array.isArray(cat)) return cat.map(c => String(c).trim()).filter(Boolean);
  return [];
}

function extractArrayField(product: Record<string, unknown>, fieldName: string): string[] {
  const field = product[fieldName];
  if (!field) return [];
  if (typeof field === 'string') return [field.trim()].filter(Boolean);
  if (Array.isArray(field)) return field.map(v => String(v).trim()).filter(Boolean);
  return [];
}
