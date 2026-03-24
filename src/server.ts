import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ProductData, EnrichmentResult, MppChallenge } from './types.js';
import { TOOL_PRICING } from './types.js';
import { extractProduct } from './extract.js';
import { EnrichmentCache } from './cache.js';
import { PaymentManager } from './payments.js';

/**
 * Create and configure the MCP server with enrichment tools.
 */
export function createServer(
  cache: EnrichmentCache,
  payments: PaymentManager,
): McpServer {
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
    async ({ url, payment_method_id }) => {
      return handleEnrichment('enrich_product', url, payment_method_id, cache, payments);
    },
  );

  // Basic enrichment tool
  server.tool(
    'enrich_basic',
    'Extract basic product attributes from a URL (name, price, brand, availability). Faster and cheaper than enrich_product. Costs $0.01 per call (cached results are free).',
    enrichParams,
    toolAnnotations,
    async ({ url, payment_method_id }) => {
      return handleEnrichment('enrich_basic', url, payment_method_id, cache, payments);
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
            enrich_basic: { price_usd: 0.01, description: 'Basic attributes only (name, price, brand, availability)' },
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

/**
 * Handle enrichment request with payment gating and caching.
 */
async function handleEnrichment(
  toolName: 'enrich_product' | 'enrich_basic',
  url: string,
  paymentMethodId: string | undefined,
  cache: EnrichmentCache,
  payments: PaymentManager,
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  const cached = cache.get(url);
  if (cached) {
    const result: EnrichmentResult = { product: cached, cached: true };
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }

  if (!paymentMethodId) {
    const challenge: MppChallenge = payments.createChallenge(toolName);
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          error: 'payment_required',
          status: 402,
          challenge,
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
    product = await extractProduct(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Extraction failed';
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: 'extraction_failed', message, receipt }, null, 2) }],
      isError: true,
    };
  }

  if (toolName === 'enrich_basic') {
    product.image_urls = [];
    product.primary_image_url = null;
  }

  cache.set(url, product);
  const result: EnrichmentResult = { product, receipt, cached: false };
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
