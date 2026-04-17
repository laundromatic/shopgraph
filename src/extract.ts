import type { ProductData, EnrichmentOptions, ShopGraphMetadata, ExtractionStatus, FieldFreshness, ExtractionMethod } from './types.js';
import { buildFieldFreshness, applyDecay } from './types.js';
import { extractSchemaOrg } from './schema-org.js';
import { extractWithLlm } from './llm-extract.js';
import { signRequest } from './agent-identity.js';
import { probeAccess, type AccessProbeResult } from './access-probe.js';
import { isAccessReadinessActive } from './agent-ready.js';
import { getRedis } from './redis.js';

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
 * Detect if fetched HTML is a CDN block page rather than real content.
 * These pages return HTTP 200 but contain bot-blocking messages.
 */
function isBlockPage(html: string): boolean {
  const blockPatterns = [
    'Access is temporarily restricted',
    'Please verify you are a human',
    'Please verify you are not a robot',
    'Enable JavaScript and cookies to continue',
    'Checking your browser before accessing',
    'Attention Required! | Cloudflare',
    'Just a moment...',
    'cf-browser-verification',
    'challenge-platform',
    'Pardon Our Interruption',
    'Access Denied',
    'This request was blocked by our security service',
  ];
  const lowerHtml = html.toLowerCase();
  return blockPatterns.some(p => lowerHtml.includes(p.toLowerCase()));
}

/**
 * Apply _shopgraph metadata and optional threshold scrubbing to a product result.
 * @param fromCache - true if this result is being served from cache
 */
export function applyThresholdAndMetadata(
  product: ProductData,
  options?: EnrichmentOptions,
  fromCache: boolean = false,
): ProductData {
  const now = new Date();
  const extractionTime = new Date(product.extracted_at);
  const ageSeconds = Math.max(0, Math.floor((now.getTime() - extractionTime.getTime()) / 1000));

  // Compute decayed confidence when serving from cache
  const originalConfidence = { ...product.confidence.per_field };
  const effectiveConfidence = fromCache && ageSeconds > 0
    ? applyDecay(originalConfidence, ageSeconds)
    : originalConfidence;

  // Build field_freshness block (always present, shows decay state)
  const fieldFreshness: Record<string, FieldFreshness> | undefined =
    fromCache && ageSeconds > 0
      ? buildFieldFreshness(originalConfidence, ageSeconds)
      : undefined;

  // Promote per-field method attribution from the extraction result up
  // to the response-level _shopgraph block.
  const perFieldMethod = product.confidence.per_field_method;

  // Always attach _shopgraph metadata
  const metadata: ShopGraphMetadata = {
    source_url: product.url,
    extraction_timestamp: product.extracted_at,
    response_timestamp: now.toISOString(),
    extraction_method: product.extraction_method,
    data_source: fromCache ? 'cache' : 'live',
    field_confidence: effectiveConfidence,
    ...(perFieldMethod && Object.keys(perFieldMethod).length > 0 ? { field_method: perFieldMethod } : {}),
    ...(fieldFreshness ? { field_freshness: fieldFreshness } : {}),
    confidence_method: product.extraction_method === 'hybrid' ? 'cross_signal' : 'tier_baseline',
  };
  product._shopgraph = metadata;

  // Apply threshold scrubbing against EFFECTIVE (decayed) confidence
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

    for (const [fieldName, conf] of Object.entries(effectiveConfidence)) {
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
 *
 * When access readiness is active (feature flag), runs a pre-flight HEAD
 * probe to classify the target URL's access posture. Probe results are
 * cached per domain (1-hour TTL) and consumed by scoreAccessReadiness().
 */
export async function extractProduct(url: string, options?: EnrichmentOptions): Promise<ProductData> {
  // Pre-flight access probe (dormant until feature flag activates)
  if (isAccessReadinessActive()) {
    try {
      await probeAccess(url, getRedis());
    } catch {
      // Probe failure should never block extraction
    }
  }

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
 *
 * Per-field method attribution:
 *  - If both tiers produced a non-null value and they AGREE → 'hybrid'
 *  - If both produced non-null and they DISAGREE → winning tier's method
 *  - If only one tier produced a value → that tier's method
 */
function mergeResults(primary: ProductData, secondary: Partial<ProductData>): ProductData {
  const merged = { ...primary };

  // Track which fields both tiers produced (non-null/non-empty) for
  // hybrid-vs-disagreement attribution below.
  const primaryHas: Record<string, boolean> = {
    product_name: primary.product_name !== null && primary.product_name !== '',
    brand: primary.brand !== null && primary.brand !== '',
    description: primary.description !== null && primary.description !== '',
    price: primary.price !== null && primary.price.amount !== null,
    availability: primary.availability !== 'unknown',
    categories: primary.categories.length > 0,
    image_urls: primary.image_urls.length > 0,
    primary_image_url: primary.primary_image_url !== null,
    color: primary.color.length > 0,
    material: primary.material.length > 0,
    dimensions: primary.dimensions !== null,
  };
  const secondaryHas: Record<string, boolean> = {
    product_name: !!secondary.product_name,
    brand: !!secondary.brand,
    description: !!secondary.description,
    price: !!secondary.price && secondary.price.amount !== null,
    availability: !!secondary.availability && secondary.availability !== 'unknown',
    categories: !!secondary.categories && secondary.categories.length > 0,
    image_urls: !!secondary.image_urls && secondary.image_urls.length > 0,
    primary_image_url: !!secondary.primary_image_url,
    color: !!secondary.color && secondary.color.length > 0,
    material: !!secondary.material && secondary.material.length > 0,
    dimensions: !!secondary.dimensions,
  };

  // Track which fields AGREE (both tiers produced the same value) for
  // 'hybrid' method attribution and Cross-validation ledger deltas.
  const agree: Record<string, boolean> = {};
  agree.product_name = primaryHas.product_name && secondaryHas.product_name &&
    primary.product_name === secondary.product_name;
  agree.brand = primaryHas.brand && secondaryHas.brand && primary.brand === secondary.brand;
  agree.description = primaryHas.description && secondaryHas.description &&
    primary.description === secondary.description;
  agree.price = primaryHas.price && secondaryHas.price &&
    primary.price?.amount === secondary.price?.amount &&
    primary.price?.currency === secondary.price?.currency;
  agree.availability = primaryHas.availability && secondaryHas.availability &&
    primary.availability === secondary.availability;

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
  const primaryMethod = primary.confidence.per_field_method ?? {};
  const secondaryMethod = secondary.confidence?.per_field_method ?? {};

  const mergedPerFieldMethod: Record<string, ExtractionMethod> = { ...primaryMethod };

  // Fill in fields only produced by secondary. A field counts as "only
  // secondary-produced" when either the primary lacked a per_field entry
  // for it, OR the primary had an entry but its actual value was null /
  // empty (e.g. schema.org records availability='unknown' with a
  // per_field score even when no availability was actually extracted).
  if (secondary.confidence?.per_field) {
    for (const [field, conf] of Object.entries(secondary.confidence.per_field)) {
      const primaryProducedValue = primaryHas[field];
      const secondaryProducedValue = secondaryHas[field];
      if (!primaryProducedValue && secondaryProducedValue) {
        mergedPerField[field] = conf;
        if (secondaryMethod[field]) {
          mergedPerFieldMethod[field] = secondaryMethod[field];
        }
      } else if (mergedPerField[field] === undefined) {
        // Fields outside the primaryHas map (e.g. image_urls) — fall through.
        mergedPerField[field] = conf;
        if (secondaryMethod[field]) {
          mergedPerFieldMethod[field] = secondaryMethod[field];
        }
      }
    }
  }

  // For fields both tiers produced AND agreed on, tag as 'hybrid'.
  // Disagreement keeps the primary tier's method (primary wins the merge).
  for (const field of Object.keys(agree)) {
    if (!agree[field]) continue;
    mergedPerFieldMethod[field] = 'hybrid';
  }

  const fieldCount = Object.keys(mergedPerField).length;
  const overall = fieldCount > 0
    ? Object.values(mergedPerField).reduce((a, b) => a + b, 0) / fieldCount
    : 0;

  merged.confidence = {
    overall,
    per_field: mergedPerField,
    per_field_method: mergedPerFieldMethod,
  };
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

  // Detect CDN block pages (return 200 but contain bot-blocking content)
  if (isBlockPage(html)) {
    console.log(`[extract] Block page detected for ${url} (html_length=${html.length})`);
    // Try browser fallback if enabled
    if (isBrowserFallbackEnabled()) {
      try {
        const { extractWithBrowser } = await import('./browser-extract.js');
        const browserResult = await extractWithBrowser(url);
        return applyThresholdAndMetadata(browserResult, options);
      } catch (browserErr) {
        console.error(`[extract] Browser fallback failed for blocked ${url}:`, browserErr instanceof Error ? browserErr.message : browserErr);
      }
    }
    // No browser fallback or it failed — throw clear error
    throw new Error('This site restricts automated access. Extraction requires authenticated identity (RFC 9421), which is on the ShopGraph roadmap.');
  }

  // Try schema.org first (fast, high confidence)
  const schemaResult = extractSchemaOrg(html);
  console.log(`[extract] Schema.org for ${url}: product_name=${schemaResult?.product_name ?? 'null'}, html_length=${html.length}`);
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
  console.log(`[extract] Schema.org empty for ${url}, attempting LLM fallback`);
  let llmResult;
  try {
    llmResult = await extractWithLlm(html, url);
    console.log(`[extract] LLM result for ${url}: product_name=${llmResult?.product_name ?? 'null'}`);
  } catch (llmErr) {
    console.error(`[extract] LLM fallback failed for ${url}:`, llmErr instanceof Error ? llmErr.message : llmErr);
  }
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

// ── Web Bot Auth detection ────────────────────────────────────────

/** Headers that signal Web Bot Auth / agent identity requirements */
const WEB_BOT_AUTH_HEADERS = [
  'www-authenticate',
  'signature-input',
  'x-robots-tag',
];

/** Per-fetch result tracking for Web Bot Auth signals */
export interface FetchAccessSignals {
  url: string;
  status: number;
  requiresAuth: boolean;
  requiresPayment: boolean;
  hasSignatureInput: boolean;
}

/** Last fetch's access signals — read by test runner after each extraction */
let _lastAccessSignals: FetchAccessSignals | null = null;

export function getLastAccessSignals(): FetchAccessSignals | null {
  return _lastAccessSignals;
}

/**
 * Fetch a page with realistic headers, RFC 9421 signatures, and timeout.
 */
export async function fetchPage(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  // Sign the outbound request with Ed25519 (RFC 9421)
  let sigHeaders: Record<string, string> = {};
  try {
    sigHeaders = signRequest('GET', url);
  } catch {
    // Signing failure should not block extraction
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'ShopGraph/1.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        ...sigHeaders,
      },
      signal: controller.signal,
      redirect: 'follow',
    });

    // Detect Web Bot Auth signals in response headers
    const hasWwwAuth = response.headers.has('www-authenticate');
    const hasSigInput = response.headers.has('signature-input');
    const is402 = response.status === 402;
    const is401WithAuth = response.status === 401 && hasWwwAuth;

    _lastAccessSignals = {
      url,
      status: response.status,
      requiresAuth: is401WithAuth || hasSigInput,
      requiresPayment: is402,
      hasSignatureInput: hasSigInput,
    };

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}
