import type { ProductData, ExtractionMethod } from './types.js';
import { extractSchemaOrg } from './schema-org.js';
import { extractWithLlm } from './llm-extract.js';
import chromium from '@sparticuz/chromium';
import { chromium as playwrightChromium } from 'playwright-core';

const BROWSER_LAUNCH_TIMEOUT = 10_000;
const PAGE_LOAD_TIMEOUT = 15_000;

/**
 * Pool of realistic Chrome User-Agent strings for stealth rotation.
 */
const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

function randomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Retag a confidence block's per-field method as `playwright`. The
 * rendered-HTML path re-runs schema.org / llm extractors on content
 * that was only obtainable via browser rendering, so the source tier is
 * effectively `playwright` for every produced field.
 */
function retagForPlaywright(confidence: {
  overall: number;
  per_field: Record<string, number>;
  per_field_method?: Record<string, ExtractionMethod>;
}) {
  const perFieldMethod: Record<string, ExtractionMethod> = {};
  for (const field of Object.keys(confidence.per_field)) {
    perFieldMethod[field] = 'playwright';
  }
  return {
    overall: confidence.overall,
    per_field: confidence.per_field,
    per_field_method: perFieldMethod,
  };
}

/**
 * Extract product data using a headless browser (Playwright + @sparticuz/chromium).
 * This renders JS-heavy pages that return incomplete data via fetch().
 *
 * Uses @sparticuz/chromium for Vercel/Lambda serverless compatibility.
 * Requires: ENABLE_BROWSER_FALLBACK=true env var.
 */
export async function extractWithBrowser(url: string): Promise<ProductData> {
  const now = new Date().toISOString();
  let browser;

  try {
    browser = await playwrightChromium.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
      timeout: BROWSER_LAUNCH_TIMEOUT,
    });

    const context = await browser.newContext({
      userAgent: randomUserAgent(),
      viewport: { width: 1920, height: 1080 },
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-User': '?1',
        'Sec-Fetch-Dest': 'document',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      },
    });

    const page = await context.newPage();

    await page.goto(url, {
      timeout: PAGE_LOAD_TIMEOUT,
      waitUntil: 'networkidle',
    });

    // Extra wait for late-loading JS (price widgets, etc.)
    await page.waitForTimeout(2000);

    const html = await page.content();

    await browser.close();
    browser = undefined;

    // Run the same extraction pipeline on rendered HTML
    const schemaResult = extractSchemaOrg(html);
    if (schemaResult && schemaResult.product_name) {
      const base = schemaResult.confidence ?? { overall: 0, per_field: {} };
      return {
        url,
        extracted_at: now,
        extraction_method: 'hybrid',
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
        confidence: retagForPlaywright(base),
      };
    }

    // Fall back to LLM extraction on rendered HTML
    const llmResult = await extractWithLlm(html, url);
    if (llmResult && llmResult.product_name) {
      const base = llmResult.confidence ?? { overall: 0, per_field: {} };
      return {
        url,
        extracted_at: now,
        extraction_method: 'hybrid',
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
        confidence: retagForPlaywright(base),
      };
    }

    // Neither method worked on rendered HTML
    return {
      url,
      extracted_at: now,
      extraction_method: 'hybrid',
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
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
