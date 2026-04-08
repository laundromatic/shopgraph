import type { ProductData, EnrichmentOptions, ExtractionStatus, ShopGraphMetadata } from './types.js';
import type { UcpLineItem, UcpItem, UcpTotal } from './types.js';
import { createHash } from 'node:crypto';

/**
 * Validation error returned when required UCP fields are missing.
 */
export interface UcpValidationError {
  valid: false;
  missing_fields: string[];
  message: string;
}

/**
 * Successful UCP mapping result.
 */
export interface UcpMappingResult {
  valid: true;
  line_item: UcpLineItem;
}

/**
 * Map a ProductData result to UCP line_item format.
 *
 * Required UCP fields: item.id, item.title, item.price, quantity.
 * If any required field is missing (null/undefined), returns a validation error.
 */
export function mapToUcp(
  product: ProductData,
  _options?: EnrichmentOptions,
): UcpMappingResult | UcpValidationError {
  const missingFields: string[] = [];

  // Check required fields
  if (!product.url) missingFields.push('item.id (mapped from url)');
  if (!product.product_name) missingFields.push('item.title (mapped from product_name)');
  if (product.price === null || product.price?.amount === null || product.price?.amount === undefined) {
    missingFields.push('item.price (mapped from price.amount)');
  }

  if (missingFields.length > 0) {
    return {
      valid: false,
      missing_fields: missingFields,
      message: `Cannot produce UCP line_item: missing required fields: ${missingFields.join(', ')}`,
    };
  }

  // Build the UCP item
  const item: UcpItem = {
    id: product.url,
    title: product.product_name!,
    price: Math.round((product.price!.amount!) * 100), // Convert to minor currency units (cents)
  };

  // Optional item fields
  if (product.primary_image_url) {
    item.image_url = product.primary_image_url;
  }

  // Build extraction status for optional UCP-adjacent fields not in core spec
  const extractionStatus: Record<string, ExtractionStatus> = {
    ...(product._extraction_status ?? {}),
  };

  // Mark optional product fields that are not available
  const optionalFieldChecks: Array<{ field: string; value: unknown; emptyCheck?: unknown }> = [
    { field: 'brand', value: product.brand },
    { field: 'description', value: product.description },
    { field: 'availability', value: product.availability, emptyCheck: 'unknown' },
    { field: 'categories', value: product.categories, emptyCheck: [] },
    { field: 'color', value: product.color, emptyCheck: [] },
    { field: 'material', value: product.material, emptyCheck: [] },
    { field: 'dimensions', value: product.dimensions },
  ];

  for (const { field, value, emptyCheck } of optionalFieldChecks) {
    const isEmpty = value === null || value === undefined ||
      (Array.isArray(emptyCheck) && Array.isArray(value) && value.length === 0) ||
      (typeof emptyCheck === 'string' && value === emptyCheck);

    if (isEmpty && !extractionStatus[field]) {
      extractionStatus[field] = {
        status: 'not_available',
        message: `Field '${field}' was not extracted from the source page.`,
      };
    }
  }

  // Generate a deterministic line_item id from the product URL
  const lineItemId = `li_${createHash('sha256').update(product.url).digest('hex').slice(0, 12)}`;

  // Build totals array (required in UCP responses)
  const priceInCents = Math.round((product.price!.amount!) * 100);
  const totals: UcpTotal[] = [
    { type: 'subtotal', amount: priceInCents },
  ];

  const lineItem: UcpLineItem = {
    id: lineItemId,
    item,
    quantity: 1,
    totals,
    _shopgraph: product._shopgraph,
  };

  if (Object.keys(extractionStatus).length > 0) {
    lineItem._extraction_status = extractionStatus;
  }

  // Carry over extended product data as UCP extensions
  const extensions: Record<string, unknown> = {};
  if (product.brand) extensions.brand = product.brand;
  if (product.description) extensions.description = product.description;
  if (product.availability && product.availability !== 'unknown') extensions.availability = product.availability;
  if (product.categories && product.categories.length > 0) extensions.categories = product.categories;
  if (product.color && product.color.length > 0) extensions.color = product.color;
  if (product.material && product.material.length > 0) extensions.material = product.material;
  if (product.dimensions) extensions.dimensions = product.dimensions;
  if (product.price?.currency) extensions.currency = product.price.currency;
  if (product.price?.sale_price != null) extensions.sale_price = product.price.sale_price;
  if (product.image_urls && product.image_urls.length > 0) extensions.image_urls = product.image_urls;

  if (Object.keys(extensions).length > 0) {
    lineItem._extensions = extensions;
  }

  return { valid: true, line_item: lineItem };
}

/**
 * Validate that a UCP line_item output has all required fields.
 */
export function validateUcpOutput(output: UcpLineItem): { valid: boolean; missing_fields: string[] } {
  const missing: string[] = [];

  if (!output.id) missing.push('id');

  if (!output.item) {
    missing.push('item');
  } else {
    if (!output.item.id) missing.push('item.id');
    if (!output.item.title) missing.push('item.title');
    if (output.item.price === null || output.item.price === undefined) missing.push('item.price');
  }

  if (!output.quantity || output.quantity < 1) missing.push('quantity');
  if (!output.totals || output.totals.length === 0) missing.push('totals');

  return { valid: missing.length === 0, missing_fields: missing };
}
