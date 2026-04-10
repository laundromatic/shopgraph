import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ProductData, EnrichmentResult, MppChallenge, EnrichmentOptions, CreditMode } from './types.js';
import { TOOL_PRICING, FREE_TIER, CREDIT_MULTIPLIERS, anyFieldBelowThreshold } from './types.js';
import { extractProduct, extractFromRawHtml, extractBasicFromUrl, applyThresholdAndMetadata } from './extract.js';
import { mapToUcp } from './ucp-mapper.js';
import { scoreAgentReadiness } from './agent-ready.js';
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
    force_refresh: z.boolean().optional()
      .describe('Bypass cache entirely. Always triggers live extraction. Costs 3x credits.'),
    minimum_confidence: z.number().min(0).max(1).optional()
      .describe('Auto-refresh if any cached field\'s DECAYED confidence falls below this threshold. Costs 2x credits when refresh triggers, 0.25x on cache hit.'),
    format: z.enum(['default', 'ucp']).optional().default('default')
      .describe('Output format. "ucp" returns UCP line_item format. Default: "default".'),
    include_score: z.boolean().optional().describe('Include agent-readiness score in response.'),
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
    async ({ url, payment_method_id, strict_confidence_threshold, force_refresh, minimum_confidence, format, include_score }) => {
      const options: EnrichmentOptions = {
        strict_confidence_threshold: strict_confidence_threshold ?? undefined,
        force_refresh: force_refresh ?? undefined,
        minimum_confidence: minimum_confidence ?? undefined,
        format: format ?? 'default',
        include_score: include_score ?? undefined,
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
    async ({ url, payment_method_id, strict_confidence_threshold, force_refresh, minimum_confidence, format, include_score }) => {
      const options: EnrichmentOptions = {
        strict_confidence_threshold: strict_confidence_threshold ?? undefined,
        force_refresh: force_refresh ?? undefined,
        minimum_confidence: minimum_confidence ?? undefined,
        format: format ?? 'default',
        include_score: include_score ?? undefined,
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
      force_refresh: z.boolean().optional()
        .describe('Bypass cache entirely. Always triggers live extraction. Costs 3x credits.'),
      minimum_confidence: z.number().min(0).max(1).optional()
        .describe('Auto-refresh if any cached field\'s DECAYED confidence falls below this threshold.'),
      format: z.enum(['default', 'ucp']).optional().default('default')
        .describe('Output format. "ucp" returns UCP line_item format. Default: "default".'),
      include_score: z.boolean().optional().describe('Include agent-readiness score in response.'),
    },
    toolAnnotations,
    async ({ html, url, payment_method_id, strict_confidence_threshold, force_refresh, minimum_confidence, format, include_score }) => {
      const options: EnrichmentOptions = {
        strict_confidence_threshold: strict_confidence_threshold ?? undefined,
        force_refresh: force_refresh ?? undefined,
        minimum_confidence: minimum_confidence ?? undefined,
        format: format ?? 'default',
        include_score: include_score ?? undefined,
      };
      return handleHtmlEnrichment(url, html, payment_method_id, cache, payments, tracker, options);
    },
  );

  // Score product tool — extraction + agent-readiness scoring
  server.tool(
    'score_product',
    'Extract product data and return agent-readiness score (0-100). Scores structured data completeness, semantic richness, UCP compatibility, pricing clarity, and inventory signals. Full scoring breakdown included.',
    {
      url: z.string().url().describe('Product page URL to extract and score'),
      payment_method_id: z.string().optional().describe('Stripe payment method ID for MPP payment'),
      strict_confidence_threshold: z.number().min(0).max(1).optional()
        .describe('Fields below this confidence will be nulled with explanation. Default: off.'),
      format: z.enum(['default', 'ucp']).optional().default('default')
        .describe('Output format. "ucp" returns UCP line_item format. Default: "default".'),
    },
    toolAnnotations,
    async ({ url, payment_method_id, strict_confidence_threshold, format }) => {
      const options: EnrichmentOptions = {
        strict_confidence_threshold: strict_confidence_threshold ?? undefined,
        format: format ?? 'default',
        include_score: true,
      };
      return handleEnrichment('enrich_product', url, payment_method_id, cache, payments, tracker, options);
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
 * Format an enrichment result, optionally converting to UCP format and/or including score.
 */
function formatResult(result: object & { product: ProductData; receipt?: unknown; cached: boolean }, options?: EnrichmentOptions): ToolResponse {
  const scoreData = options?.include_score ? { score: scoreAgentReadiness(result.product) } : {};

  if (options?.format === 'ucp') {
    const ucpResult = mapToUcp(result.product, options);
    if (!ucpResult.valid) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          error: 'ucp_mapping_failed',
          ...ucpResult,
          ...scoreData,
          receipt: result.receipt,
        }, null, 2) }],
        isError: true,
      };
    }
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({
        line_item: ucpResult.line_item,
        ...scoreData,
        receipt: result.receipt,
        cached: result.cached,
      }, null, 2) }],
    };
  }
  return { content: [{ type: 'text' as const, text: JSON.stringify({ ...result, ...scoreData }, null, 2) }] };
}

/**
 * Determine credit mode based on cache state and execution flags.
 */
function determineCreditMode(
  cached: ProductData | undefined,
  options?: EnrichmentOptions,
): { mode: CreditMode; shouldExtract: boolean } {
  // force_refresh always extracts
  if (options?.force_refresh) {
    return { mode: 'force_refresh', shouldExtract: true };
  }

  if (!cached) {
    return { mode: 'standard', shouldExtract: true };
  }

  // Check minimum_confidence against decayed values
  if (options?.minimum_confidence != null) {
    const extractionTime = new Date(cached.extracted_at);
    const ageSeconds = Math.max(0, Math.floor((Date.now() - extractionTime.getTime()) / 1000));
    if (anyFieldBelowThreshold(cached.confidence.per_field, ageSeconds, options.minimum_confidence)) {
      return { mode: 'auto_refresh', shouldExtract: true };
    }
  }

  return { mode: 'cache_hit', shouldExtract: false };
}

/**
 * Handle URL-based enrichment with payment gating, free tier, caching, and execution flags.
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
  const { mode, shouldExtract } = determineCreditMode(cached, options);

  // Serve from cache when appropriate (with decay applied)
  if (!shouldExtract && cached) {
    const product = applyThresholdAndMetadata({ ...cached }, options, true);
    const result: EnrichmentResult & { credit_mode: CreditMode } = {
      product,
      cached: true,
      credit_mode: mode,
    };
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
      const result: EnrichmentResult & { free_tier: { used: number; limit: number }; upgrade_hint?: string; credit_mode: CreditMode } = {
        product,
        cached: false,
        credit_mode: 'standard',
        free_tier: { used: usage + 1, limit: FREE_TIER.MONTHLY_LIMIT },
        ...(hasData ? {} : { upgrade_hint: 'No Schema.org data found on this page. Use enrich_product ($0.02) for LLM-powered extraction.' }),
      };
      return formatResult(result, options);
    }
    // Free tier exhausted — fall through to payment required
  }

  if (!paymentMethodId) {
    const challenge: MppChallenge = payments.createChallenge(toolName);
    const creditMultiplier = CREDIT_MULTIPLIERS[mode];
    const freeTierInfo = isFreeTierEligible
      ? { free_tier_exhausted: true, used: tracker.getUsage(clientId), limit: FREE_TIER.MONTHLY_LIMIT }
      : undefined;
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          error: 'payment_required',
          status: 402,
          challenge: { ...challenge, amount: Math.ceil(challenge.amount * creditMultiplier) },
          credit_mode: mode,
          credit_multiplier: creditMultiplier,
          ...freeTierInfo,
          message: `Payment required. Include a payment_method_id to proceed. Cost: $${((TOOL_PRICING[toolName] * creditMultiplier) / 100).toFixed(2)} (${mode})`,
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

    // Extraction failed — attempt cache fallback before returning error.
    // If we have stale cache data, serve it at cache_hit pricing instead
    // of charging the premium rate for a failed extraction.
    const staleCached = cache.get(url);
    if (staleCached) {
      const fallbackProduct = applyThresholdAndMetadata({ ...staleCached }, options, true);
      const result: EnrichmentResult & { credit_mode: CreditMode; extraction_error: string } = {
        product: fallbackProduct,
        receipt,
        cached: true,
        credit_mode: 'cache_hit',
        extraction_error: message,
      };
      return formatResult(result, options);
    }

    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: 'extraction_failed', message, receipt }, null, 2) }],
      isError: true,
    };
  }

  cache.set(url, product);
  const result: EnrichmentResult & { credit_mode: CreditMode } = {
    product,
    receipt,
    cached: false,
    credit_mode: mode,
  };
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
  const { mode, shouldExtract } = determineCreditMode(cached, options);

  if (!shouldExtract && cached) {
    const product = applyThresholdAndMetadata({ ...cached }, options, true);
    const result: EnrichmentResult & { credit_mode: CreditMode } = {
      product,
      cached: true,
      credit_mode: mode,
    };
    return formatResult(result, options);
  }

  if (!paymentMethodId) {
    const creditMultiplier = CREDIT_MULTIPLIERS[mode];
    const challenge: MppChallenge = payments.createChallenge('enrich_html');
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          error: 'payment_required',
          status: 402,
          challenge: { ...challenge, amount: Math.ceil(challenge.amount * creditMultiplier) },
          credit_mode: mode,
          message: `Payment required. Include a payment_method_id to proceed. Cost: $${((TOOL_PRICING.enrich_html * creditMultiplier) / 100).toFixed(2)} (${mode})`,
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
  const result: EnrichmentResult & { credit_mode: CreditMode } = {
    product,
    receipt,
    cached: false,
    credit_mode: mode,
  };
  return formatResult(result, options);
}
