import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ProductData, EnrichmentResult, MppChallenge, EnrichmentOptions } from './types.js';
import { TOOL_PRICING, FREE_TIER } from './types.js';
import { extractProduct, extractFromRawHtml, extractBasicFromUrl } from './extract.js';
import { mapToUcp } from './ucp-mapper.js';
import { EnrichmentCache } from './cache.js';
import { PaymentManager } from './payments.js';
import { FreeTierTracker } from './free-tier.js';

/**
 * Create and configure the MCP server with enrichment tools.
 */
export function createServer(
  cache: EnrichmentCache,
  payments: PaymentManager,
  freeTier?: FreeTierTracker,
): McpServer {
  const tracker = freeTier ?? new FreeTierTracker();
  const server = new McpServer({
    name: 'shopgraph',
    version: '1.0.0',
  }, {
    capabilities: {
      tools: { listChanged: true },
      prompts: { listChanged: true },
      resources: { listChanged: true },
    },
  });

  // === TOOLS (with annotations) ===

  const enrichParams = {
    url: z.string().url().describe('Product page URL to extract data from'),
    payment_method_id: z.string().optional().describe('Stripe payment method ID for MPP payment'),
    strict_confidence_threshold: z.number().min(0).max(1).optional()
      .describe('Fields below this confidence will be nulled with explanation. Default: off.'),
    format: z.enum(['default', 'ucp']).optional().default('default')
      .describe('Output format. "ucp" returns UCP line_item format. Default: "default".'),
  };

  const toolAnnotations = {
    readOnlyHint: true,
    openWorldHint: true,
  };

  // Full enrichment tool
  server.tool(
    'enrich_product',
    'Extract comprehensive product data from a URL including name, price, brand, images, availability, and more. Uses schema.org structured data when available, with LLM fallback. Costs $0.02 per call (cached results are free).',
    enrichParams,
    toolAnnotations,
    async ({ url, payment_method_id, strict_confidence_threshold, format }) => {
      const options: EnrichmentOptions = {
        strict_confidence_threshold: strict_confidence_threshold ?? undefined,
        format: format ?? 'default',
      };
      return handleEnrichment('enrich_product', url, payment_method_id, cache, payments, tracker, options);
    },
  );

  // Basic enrichment tool (free tier eligible: 500 calls/month without payment)
  server.tool(
    'enrich_basic',
    `Extract basic product attributes from a URL (name, price, brand, availability). Faster and cheaper than enrich_product. ${FREE_TIER.MONTHLY_LIMIT} free calls/month — no payment needed. Paid: $0.01 per call after free tier.`,
    enrichParams,
    toolAnnotations,
    async ({ url, payment_method_id, strict_confidence_threshold, format }) => {
      const options: EnrichmentOptions = {
        strict_confidence_threshold: strict_confidence_threshold ?? undefined,
        format: format ?? 'default',
      };
      return handleEnrichment('enrich_basic', url, payment_method_id, cache, payments, tracker, options);
    },
  );

  // HTML enrichment tool — agents bring their own scraped HTML
  server.tool(
    'enrich_html',
    'Extract product data from raw HTML you already have (no HTTP fetch needed). Ideal when using Bright Data, Firecrawl, or any scraping API — pipe the HTML through ShopGraph for structured product data. Uses schema.org + LLM fallback. Costs $0.02 per call (cached results are free).',
    {
      html: z.string().describe('Raw HTML content of the product page'),
      url: z.string().url().describe('Original URL of the page (used for context and caching)'),
      payment_method_id: z.string().optional().describe('Stripe payment method ID for MPP payment'),
      strict_confidence_threshold: z.number().min(0).max(1).optional()
        .describe('Fields below this confidence will be nulled with explanation. Default: off.'),
      format: z.enum(['default', 'ucp']).optional().default('default')
        .describe('Output format. "ucp" returns UCP line_item format. Default: "default".'),
    },
    toolAnnotations,
    async ({ html, url, payment_method_id, strict_confidence_threshold, format }) => {
      const options: EnrichmentOptions = {
        strict_confidence_threshold: strict_confidence_threshold ?? undefined,
        format: format ?? 'default',
      };
      return handleHtmlEnrichment(url, html, payment_method_id, cache, payments, tracker, options);
    },
  );

  // === PROMPTS ===

  server.prompt(
    'enrich-example',
    'Example of how to use ShopGraph to extract product data from a URL',
    { url: z.string().url().describe('Product URL to enrich').default('https://www.allbirds.com/products/mens-tree-runners') },
    ({ url }) => ({
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Use the enrich_product tool to extract structured product data from this URL: ${url}\n\nThe tool will return JSON with product name, brand, price, availability, categories, images, colors, materials, and confidence scores per field.\n\nIf you receive a payment_required response (402), you'll need to provide a Stripe payment method ID. The cost is $0.02 for full enrichment or $0.01 for basic.`,
        },
      }],
    }),
  );

  // === RESOURCES ===

  server.resource(
    'pricing',
    'shopgraph://pricing',
    { description: 'ShopGraph pricing and tool information', mimeType: 'application/json' },
    async () => ({
      contents: [{
        uri: 'shopgraph://pricing',
        text: JSON.stringify({
          tools: {
            enrich_product: { price_usd: 0.02, description: 'Full extraction with all attributes and images' },
            enrich_basic: { price_usd: 0.01, description: 'Schema.org extraction only (fast, zero LLM cost). Free: 500 calls/month.' },
            enrich_html: { price_usd: 0.02, description: 'Extract from raw HTML (bring your own scraper). Full extraction.' },
          },
          free_tier: {
            monthly_limit: FREE_TIER.MONTHLY_LIMIT,
            eligible_tools: FREE_TIER.TOOLS,
            description: `${FREE_TIER.MONTHLY_LIMIT} free enrich_basic calls per month. No credit card required.`,
          },
          payment: 'Stripe Machine Payments Protocol (MPP)',
          cache: '24h — cached results are free',
          website: 'https://shopgraph.dev',
        }, null, 2),
        mimeType: 'application/json',
      }],
    }),
  );

  return server;
}

type ToolResponse = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

/**
 * Format an enrichment result, optionally converting to UCP format.
 */
function formatResult(result: object & { product: ProductData; receipt?: unknown; cached: boolean }, options?: EnrichmentOptions): ToolResponse {
  if (options?.format === 'ucp') {
    const ucpResult = mapToUcp(result.product, options);
    if (!ucpResult.valid) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          error: 'ucp_mapping_failed',
          ...ucpResult,
          receipt: result.receipt,
        }, null, 2) }],
        isError: true,
      };
    }
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({
        line_item: ucpResult.line_item,
        receipt: result.receipt,
        cached: result.cached,
      }, null, 2) }],
    };
  }
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}

/**
 * Handle URL-based enrichment with payment gating, free tier, and caching.
 */
async function handleEnrichment(
  toolName: 'enrich_product' | 'enrich_basic',
  url: string,
  paymentMethodId: string | undefined,
  cache: EnrichmentCache,
  payments: PaymentManager,
  tracker: FreeTierTracker,
  options?: EnrichmentOptions,
): Promise<ToolResponse> {
  const cached = cache.get(url);
  if (cached) {
    const result: EnrichmentResult = { product: cached, cached: true };
    return formatResult(result, options);
  }

  // Check free tier eligibility before requiring payment
  const isFreeTierEligible = (FREE_TIER.TOOLS as readonly string[]).includes(toolName);
  const clientId = paymentMethodId ?? 'anonymous';

  if (!paymentMethodId && isFreeTierEligible) {
    const usage = tracker.getUsage(clientId);
    if (usage < FREE_TIER.MONTHLY_LIMIT) {
      // Free tier: Schema.org only (zero API cost)
      let product: ProductData;
      try {
        product = await extractBasicFromUrl(url, options);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Extraction failed';
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'extraction_failed', message }, null, 2) }],
          isError: true,
        };
      }

      const hasData = product.product_name !== null;
      tracker.increment(clientId);
      cache.set(url, product);
      const result: EnrichmentResult & { free_tier: { used: number; limit: number }; upgrade_hint?: string } = {
        product,
        cached: false,
        free_tier: { used: usage + 1, limit: FREE_TIER.MONTHLY_LIMIT },
        ...(hasData ? {} : { upgrade_hint: 'No Schema.org data found on this page. Use enrich_product ($0.02) for LLM-powered extraction.' }),
      };
      return formatResult(result, options);
    }
    // Free tier exhausted — fall through to payment required
  }

  if (!paymentMethodId) {
    const challenge: MppChallenge = payments.createChallenge(toolName);
    const freeTierInfo = isFreeTierEligible
      ? { free_tier_exhausted: true, used: tracker.getUsage(clientId), limit: FREE_TIER.MONTHLY_LIMIT }
      : undefined;
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          error: 'payment_required',
          status: 402,
          challenge,
          ...freeTierInfo,
          message: `Payment required. Include a payment_method_id to proceed. Cost: $${(TOOL_PRICING[toolName] / 100).toFixed(2)}`,
        }, null, 2),
      }],
      isError: true,
    };
  }

  let receipt;
  try {
    receipt = await payments.processPayment(toolName, paymentMethodId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Payment processing failed';
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: 'payment_failed', message }, null, 2) }],
      isError: true,
    };
  }

  let product: ProductData;
  try {
    // enrich_basic uses Schema.org only (even when paid — consistent behavior)
    // enrich_product uses full pipeline (Schema.org → LLM → browser fallback)
    product = toolName === 'enrich_basic'
      ? await extractBasicFromUrl(url, options)
      : await extractProduct(url, options);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Extraction failed';
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: 'extraction_failed', message, receipt }, null, 2) }],
      isError: true,
    };
  }

  cache.set(url, product);
  const result: EnrichmentResult = { product, receipt, cached: false };
  return formatResult(result, options);
}

/**
 * Handle HTML-based enrichment (agent provides raw HTML, no fetch needed).
 */
async function handleHtmlEnrichment(
  url: string,
  html: string,
  paymentMethodId: string | undefined,
  cache: EnrichmentCache,
  payments: PaymentManager,
  tracker: FreeTierTracker,
  options?: EnrichmentOptions,
): Promise<ToolResponse> {
  const cached = cache.get(url);
  if (cached) {
    const result: EnrichmentResult = { product: cached, cached: true };
    return formatResult(result, options);
  }

  if (!paymentMethodId) {
    const challenge: MppChallenge = payments.createChallenge('enrich_html');
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          error: 'payment_required',
          status: 402,
          challenge,
          message: `Payment required. Include a payment_method_id to proceed. Cost: $${(TOOL_PRICING.enrich_html / 100).toFixed(2)}`,
        }, null, 2),
      }],
      isError: true,
    };
  }

  let receipt;
  try {
    receipt = await payments.processPayment('enrich_html', paymentMethodId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Payment processing failed';
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: 'payment_failed', message }, null, 2) }],
      isError: true,
    };
  }

  let product: ProductData;
  try {
    product = await extractFromRawHtml(html, url, options);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Extraction failed';
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: 'extraction_failed', message, receipt }, null, 2) }],
      isError: true,
    };
  }

  cache.set(url, product);
  const result: EnrichmentResult = { product, receipt, cached: false };
  return formatResult(result, options);
}
