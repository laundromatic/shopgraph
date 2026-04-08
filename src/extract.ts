import type { ProductData, EnrichmentOptions, ShopGraphMetadata, ExtractionStatus } from './types.js';
import { extractSchemaOrg } from './schema-org.js';
import { extractWithLlm } from './llm-extract.js';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const FETCH_TIMEOUT_MS = 15_000;

/**
 * Check if browser fallback is enabled via environment variable.
 */
export function isBrowserFallbackEnabled(): boolean {
  return process.env.ENABLE_BROWSER_FALLBACK === 'true';
}

/**
 * Determine if a result is missing price/availability data and should trigger browser fallback.
 */
function needsBrowserFallback(result: ProductData): boolean {
  return result.price === null && result.availability === 'unknown';
}

/**
 * Apply _shopgraph metadata and optional threshold scrubbing to a product result.
 */
function applyThresholdAndMetadata(
  product: ProductData,
  options?: EnrichmentOptions,
): ProductData {
  // Always attach _shopgraph metadata
  const metadata: ShopGraphMetadata = {
    source_url: product.url,
    extraction_timestamp: product.extracted_at,
    extraction_method: product.extraction_method,
    field_confidence: { ...product.confidence.per_field },
    confidence_method: 'tier_baseline',
  };
  product._shopgraph = metadata;

  // Apply threshold scrubbing if requested
  const threshold = options?.strict_confidence_threshold;
  if (threshold != null && threshold > 0) {
    const status: Record<string, ExtractionStatus> = {};
    const scrubFields: Record<string, { nullValue: unknown; property: keyof ProductData }> = {
      product_name: { nullValue: null, property: 'product_name' },
      brand: { nullValue: null, property: 'brand' },
      description: { nullValue: null, property: 'description' },
      price: { nullValue: null, property: 'price' },
      availability: { nullValue: 'unknown', property: 'availability' },
      categories: { nullValue: [], property: 'categories' },
      color: { nullValue: [], property: 'color' },
      material: { nullValue: [], property: 'material' },
      dimensions: { nullValue: null, property: 'dimensions' },
    };

    for (const [fieldName, conf] of Object.entries(product.confidence.per_field)) {
      if (conf < threshold && scrubFields[fieldName]) {
        status[fieldName] = {
          status: 'below_threshold',
          confidence: conf,
          threshold,
          message: `Extracted value below confidence threshold. Confidence: ${conf.toFixed(2)}, threshold: ${threshold.toFixed(2)}.`,
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (product as any)[scrubFields[fieldName].property] = scrubFields[fieldName].nullValue;
      }
    }

    if (Object.keys(status).length > 0) {
      product._extraction_status = status;
    }
  }

  return product;
}

/**
 * Main extraction orchestrator.
 * Fetches URL, tries schema.org first, falls back to LLM.
 * If result is missing price AND availability, tries browser fallback (when enabled).
 */
export async function extractProduct(url: string, options?: EnrichmentOptions): Promise<ProductData> {
  let fetchResult: ProductData;
  let fetchFailed403 = false;

  try {
    fetchResult = await extractFromHtml(url, options);
  } catch (error: unknown) {
    // If fetch returns 403 (bot blocked), try browser fallback
    if (error instanceof Error && error.message.includes('HTTP 403') && isBrowserFallbackEnabled()) {
      fetchFailed403 = true;
      fetchResult = null as unknown as ProductData; // will be replaced by browser result
    } else {
      throw error;
    }
  }

  // Determine if we need browser fallback
  const shouldFallback = isBrowserFallbackEnabled() && (
    fetchFailed403 || (fetchResult && needsBrowserFallback(fetchResult))
  );

  if (shouldFallback) {
    try {
      const { extractWithBrowser } = await import('./browser-extract.js');
      const browserResult = await extractWithBrowser(url);
      return applyThresholdAndMetadata(browserResult, options);
    } catch {
      // Browser fallback failed — return original fetch result if we have it
      if (fetchFailed403) {
        // Re-throw original error since we have no result at all
        throw new Error(`HTTP 403: Forbidden`);
      }
      return applyThresholdAndMetadata(fetchResult, options);
    }
  }

  return applyThresholdAndMetadata(fetchResult, options);
}

/**
 * Extract product data from pre-provided HTML (no HTTP fetch).
 * Used by the enrich_html tool when agents bring their own scraped HTML.
 */
export async function extractFromRawHtml(html: string, url: string, options?: EnrichmentOptions): Promise<ProductData> {
  return extractFromHtmlContent(html, url, options);
}

/**
 * Schema.org-only extraction (no LLM fallback). Used by enrich_basic free tier.
 * Fast, zero API cost. Returns empty fields if no Schema.org data found.
 */
export async function extractBasicFromUrl(url: string, options?: EnrichmentOptions): Promise<ProductData> {
  const html = await fetchPage(url);
  return applyThresholdAndMetadata(extractSchemaOnly(html, url), options);
}

/**
 * Schema.org-only extraction from raw HTML. Used by enrich_basic via REST.
 */
export function extractSchemaOnly(html: string, url: string): ProductData {
  const now = new Date().toISOString();
  const schemaResult = extractSchemaOrg(html);

  if (schemaResult && schemaResult.product_name) {
    return {
      url,
      extracted_at: now,
      extraction_method: 'schema_org',
      product_name: schemaResult.product_name ?? null,
      brand: schemaResult.brand ?? null,
      description: schemaResult.description ?? null,
      price: schemaResult.price ?? null,
      availability: schemaResult.availability ?? 'unknown',
      categories: schemaResult.categories ?? [],
      image_urls: [],
      primary_image_url: null,
      color: schemaResult.color ?? [],
      material: schemaResult.material ?? [],
      dimensions: schemaResult.dimensions ?? null,
      schema_org_raw: schemaResult.schema_org_raw ?? null,
      confidence: schemaResult.confidence ?? { overall: 0, per_field: {} },
    };
  }

  // No Schema.org data found — return empty result with upgrade hint
  return {
    url,
    extracted_at: now,
    extraction_method: 'schema_org',
    product_name: null,
    brand: null,
    description: null,
    price: null,
    availability: 'unknown',
    categories: [],
    image_urls: [],
    primary_image_url: null,
    color: [],
    material: [],
    dimensions: null,
    schema_org_raw: null,
    confidence: { overall: 0, per_field: {} },
  };
}

/**
 * Extract product data from HTML fetched via fetch().
 * This is the original extraction path (schema.org → LLM).
 */
async function extractFromHtml(url: string, options?: EnrichmentOptions): Promise<ProductData> {
  const html = await fetchPage(url);
  return extractFromHtmlContent(html, url, options);
}

/**
 * Merge two extraction results. Primary fields win on conflict;
 * secondary fills null/empty fields from primary.
 */
function mergeResults(primary: ProductData, secondary: Partial<ProductData>): ProductData {
  const merged = { ...primary };

  // Fill null/empty fields from secondary
  if (!merged.product_name && secondary.product_name) {
    merged.product_name = secondary.product_name;
  }
  if (!merged.brand && secondary.brand) {
    merged.brand = secondary.brand;
  }
  if (!merged.description && secondary.description) {
    merged.description = secondary.description;
  }
  if (!merged.price && secondary.price) {
    merged.price = secondary.price;
  }
  if (merged.availability === 'unknown' && secondary.availability && secondary.availability !== 'unknown') {
    merged.availability = secondary.availability;
  }
  if (merged.categories.length === 0 && secondary.categories && secondary.categories.length > 0) {
    merged.categories = secondary.categories;
  }
  if (merged.image_urls.length === 0 && secondary.image_urls && secondary.image_urls.length > 0) {
    merged.image_urls = secondary.image_urls;
  }
  if (!merged.primary_image_url && secondary.primary_image_url) {
    merged.primary_image_url = secondary.primary_image_url;
  }
  if (merged.color.length === 0 && secondary.color && secondary.color.length > 0) {
    merged.color = secondary.color;
  }
  if (merged.material.length === 0 && secondary.material && secondary.material.length > 0) {
    merged.material = secondary.material;
  }
  if (!merged.dimensions && secondary.dimensions) {
    merged.dimensions = secondary.dimensions;
  }

  // Merge confidence: use the source that provided each field
  const mergedPerField = { ...primary.confidence.per_field };
  if (secondary.confidence?.per_field) {
    for (const [field, conf] of Object.entries(secondary.confidence.per_field)) {
      if (mergedPerField[field] === undefined) {
        mergedPerField[field] = conf;
      }
    }
  }

  const fieldCount = Object.keys(mergedPerField).length;
  const overall = fieldCount > 0
    ? Object.values(mergedPerField).reduce((a, b) => a + b, 0) / fieldCount
    : 0;

  merged.confidence = { overall, per_field: mergedPerField };
  merged.extraction_method = 'hybrid';

  return merged;
}

/**
 * Check if Schema.org result is partial — has product_name but missing
 * critical fields like price or availability.
 */
function isPartialSchemaResult(result: Partial<ProductData>): boolean {
  const hasName = result.product_name !== null && result.product_name !== undefined;
  const missingPrice = !result.price;
  const missingAvailability = !result.availability || result.availability === 'unknown';
  return hasName && (missingPrice || missingAvailability);
}

/**
 * Core extraction logic shared by both URL-fetched and pre-provided HTML paths.
 */
async function extractFromHtmlContent(html: string, url: string, options?: EnrichmentOptions): Promise<ProductData> {
  const now = new Date().toISOString();

  // Try schema.org first (fast, high confidence)
  const schemaResult = extractSchemaOrg(html);
  if (schemaResult && schemaResult.product_name) {
    const schemaProduct: ProductData = {
      url,
      extracted_at: now,
      extraction_method: 'schema_org',
      product_name: schemaResult.product_name ?? null,
      brand: schemaResult.brand ?? null,
      description: schemaResult.description ?? null,
      price: schemaResult.price ?? null,
      availability: schemaResult.availability ?? 'unknown',
      categories: schemaResult.categories ?? [],
      image_urls: schemaResult.image_urls ?? [],
      primary_image_url: schemaResult.primary_image_url ?? null,
      color: schemaResult.color ?? [],
      material: schemaResult.material ?? [],
      dimensions: schemaResult.dimensions ?? null,
      schema_org_raw: schemaResult.schema_org_raw ?? null,
      confidence: schemaResult.confidence ?? { overall: 0, per_field: {} },
    };

    // Auto-heal: if Schema.org is partial, fill gaps with LLM
    if (isPartialSchemaResult(schemaProduct)) {
      try {
        const llmResult = await extractWithLlm(html, url);
        if (llmResult) {
          const merged = mergeResults(schemaProduct, llmResult);
          merged.schema_org_raw = schemaProduct.schema_org_raw;
          return applyThresholdAndMetadata(merged, options);
        }
      } catch {
        // LLM failed — return Schema.org partial result
      }
    }

    return applyThresholdAndMetadata(schemaProduct, options);
  }

  // Fall back to LLM extraction
  const llmResult = await extractWithLlm(html, url);
  if (llmResult && llmResult.product_name) {
    return applyThresholdAndMetadata({
      url,
      extracted_at: now,
      extraction_method: 'llm',
      product_name: llmResult.product_name ?? null,
      brand: llmResult.brand ?? null,
      description: llmResult.description ?? null,
      price: llmResult.price ?? null,
      availability: llmResult.availability ?? 'unknown',
      categories: llmResult.categories ?? [],
      image_urls: llmResult.image_urls ?? [],
      primary_image_url: llmResult.primary_image_url ?? null,
      color: llmResult.color ?? [],
      material: llmResult.material ?? [],
      dimensions: llmResult.dimensions ?? null,
      schema_org_raw: null,
      confidence: llmResult.confidence ?? { overall: 0, per_field: {} },
    }, options);
  }

  // Neither method produced data
  return applyThresholdAndMetadata({
    url,
    extracted_at: now,
    extraction_method: 'schema_org',
    product_name: null,
    brand: null,
    description: null,
    price: null,
    availability: 'unknown',
    categories: [],
    image_urls: [],
    primary_image_url: null,
    color: [],
    material: [],
    dimensions: null,
    schema_org_raw: null,
    confidence: { overall: 0, per_field: {} },
  }, options);
}

/**
 * Fetch a page with realistic headers and timeout.
 */
export async function fetchPage(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: controller.signal,
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}
