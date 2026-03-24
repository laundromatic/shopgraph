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
  });

  // Full enrichment tool
  server.tool(
    'enrich_product',
    'Extract comprehensive product data from a URL including name, price, brand, images, availability, and more. Uses schema.org structured data when available, with LLM fallback. Costs $0.02 per call (cached results are free).',
    {
      url: z.string().url().describe('Product page URL to extract data from'),
      payment_method_id: z.string().optional().describe('Stripe payment method ID for MPP payment'),
    },
    async ({ url, payment_method_id }) => {
      return handleEnrichment('enrich_product', url, payment_method_id, cache, payments);
    },
  );

  // Basic enrichment tool (no image analysis)
  server.tool(
    'enrich_basic',
    'Extract basic product attributes from a URL (name, price, brand, availability). Faster and cheaper than enrich_product. Costs $0.01 per call (cached results are free).',
    {
      url: z.string().url().describe('Product page URL to extract data from'),
      payment_method_id: z.string().optional().describe('Stripe payment method ID for MPP payment'),
    },
    async ({ url, payment_method_id }) => {
      return handleEnrichment('enrich_basic', url, payment_method_id, cache, payments);
    },
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
  // Check cache first (free, no payment needed)
  const cached = cache.get(url);
  if (cached) {
    const result: EnrichmentResult = {
      product: cached,
      cached: true,
    };
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    };
  }

  // No payment method — return 402 challenge
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

  // Process payment
  let receipt;
  try {
    receipt = await payments.processPayment(toolName, paymentMethodId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Payment processing failed';
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({ error: 'payment_failed', message }, null, 2),
      }],
      isError: true,
    };
  }

  // Extract product data
  let product: ProductData;
  try {
    product = await extractProduct(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Extraction failed';
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          error: 'extraction_failed',
          message,
          receipt,
        }, null, 2),
      }],
      isError: true,
    };
  }

  // For basic enrichment, strip image analysis fields
  if (toolName === 'enrich_basic') {
    product.image_urls = [];
    product.primary_image_url = null;
  }

  // Cache the result
  cache.set(url, product);

  const result: EnrichmentResult = {
    product,
    receipt,
    cached: false,
  };

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
  };
}
