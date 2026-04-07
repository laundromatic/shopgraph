/**
 * Vercel serverless function wrapper for the Express MCP server.
 * Routes all traffic through this single function.
 *
 * HTML pages (/, /tos, /privacy, /icon.svg) are served as static files
 * from public/. This file handles only API routes and MCP endpoints.
 *
 * Vercel compiles api/*.ts separately, so we import from src/ directly.
 * Vercel's Node.js runtime handles TypeScript compilation for api/ files.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from '../src/server.js';
import { EnrichmentCache } from '../src/cache.js';
import { PaymentManager } from '../src/payments.js';
import { FreeTierTracker } from '../src/free-tier.js';
import { extractProduct, extractFromRawHtml, extractBasicFromUrl } from '../src/extract.js';
import { TOOL_PRICING, FREE_TIER, TIER_CONFIGS } from '../src/types.js';
import type { EnrichmentOptions, Customer, SubscriptionTier } from '../src/types.js';
import { mapToUcp } from '../src/ucp-mapper.js';
import { getDashboardStats, getDashboardStatsAsync } from '../src/stats.js';
import { runDailyTests } from '../src/test-runner.js';
import { runHealthCheck } from '../src/health.js';
import { verifyUrl } from '../src/verify-url.js';
import { getRedis } from '../src/redis.js';
import { createAuthMiddleware } from '../src/auth-middleware.js';
import { checkLimit, incrementUsage, getUsageSummary } from '../src/subscriptions.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const testCorpus = require('../data/test-corpus.json') as Array<{ url: string; vertical: string; added: string }>;

const app = express();
app.use(express.json());

const redis = getRedis();
app.use(createAuthMiddleware(redis));

const cache = new EnrichmentCache();
const freeTier = new FreeTierTracker();

function getPayments() {
  return new PaymentManager(
    process.env.STRIPE_SECRET_KEY || process.env.STRIPE_TEST_SECRET_KEY
  );
}

/** Parse format option from request body or query string. */
function parseFormat(req: express.Request): 'default' | 'ucp' {
  const raw = req.body?.format ?? req.query?.format;
  return raw === 'ucp' ? 'ucp' : 'default';
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'shopgraph',
    version: '1.0.0',
    runtime: 'vercel-serverless',
    tools: ['enrich_product', 'enrich_basic', 'enrich_html'],
    api: {
      'POST /api/enrich/basic': 'Schema.org only — 500 free calls/month',
      'POST /api/enrich': 'Full extraction (Schema.org → LLM) — $0.02/call',
      'POST /api/enrich/html': 'Extract from raw HTML — $0.02/call',
    },
    mcp: 'POST /mcp',
    free_tier: '500 enrich_basic calls/month — no payment required',
  });
});

// Stats API — reads from KV when available, falls back to baseline
app.get('/api/stats', async (_req, res) => {
  try {
    const stats = await getDashboardStatsAsync();
    res.json(stats);
  } catch {
    res.json(getDashboardStats());
  }
});

// Health check API — pipeline monitoring
app.get('/api/health-check', async (_req, res) => {
  try {
    const health = await runHealthCheck();
    res.json(health);
  } catch (err: unknown) {
    console.error('Health check error:', err);
    res.status(500).json({
      status: 'critical',
      success_rate: 0,
      threshold: 70,
      quarantined_urls: 0,
      last_cron_run: null,
      alerts: [{
        type: 'health_check_error',
        message: err instanceof Error ? err.message : String(err),
        since: new Date().toISOString(),
      }],
    });
  }
});

// URL verification API — verify a single URL before adding to corpus
app.get('/api/verify-url', async (req, res) => {
  const url = req.query.url as string;
  if (!url) {
    return res.status(400).json({ error: 'Missing url query parameter' });
  }

  try {
    const result = await verifyUrl(url);
    res.json(result);
  } catch (err: unknown) {
    res.status(500).json({
      valid: false,
      httpStatus: 0,
      hasProductData: false,
      reason: err instanceof Error ? err.message : String(err),
    });
  }
});

// Cron: daily test runner
// Vercel cron sends GET with Authorization: Bearer <CRON_SECRET>
// Also allow manual trigger for testing
app.get('/api/run-tests', async (req, res) => {
  // Verify cron secret if set (Vercel sets Authorization header for cron jobs)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    const result = await runDailyTests(testCorpus);
    res.json(result);
  } catch (err: unknown) {
    console.error('Test runner error:', err);
    res.status(500).json({
      error: 'Test runner failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// ---------------------------------------------------------------------------
// REST API — primary distribution surface
// ---------------------------------------------------------------------------

// POST /api/enrich/basic — Schema.org only, free tier eligible
app.post('/api/enrich/basic', async (req, res) => {
  const { url } = req.body ?? {};
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing required field: url' });
  }

  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  // Check cache first
  const cached = cache.get(url);
  if (cached) {
    return res.json({ product: { ...cached, image_urls: [], primary_image_url: null }, cached: true });
  }

  // ── API key auth path ──
  if (req.customer && redis) {
    const limit = await checkLimit(redis, req.customer.id, req.customer.tier);
    if (!limit.allowed) {
      return res.status(429).json({
        error: 'tier_limit_exhausted',
        used: limit.used,
        limit: limit.limit,
        tier: req.customer.tier,
        message: `Monthly limit reached (${limit.limit}/month on ${req.customer.tier} tier).`,
      });
    }

    try {
      const product = await extractBasicFromUrl(url);
      await incrementUsage(redis, req.customer.id);
      cache.set(url, product);

      const usage = await getUsageSummary(redis, req.customer.id, req.customer.tier);
      const hasData = product.product_name !== null;
      return res.json({
        product,
        cached: false,
        usage,
        ...(hasData ? {} : {
          upgrade_hint: 'No Schema.org data found. Use /api/enrich for LLM-powered extraction.',
        }),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Extraction failed';
      return res.status(500).json({ error: 'extraction_failed', message });
    }
  }

  // ── IP-based free tier path (unchanged) ──
  const clientId = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'anonymous';
  const usage = freeTier.getUsage(clientId);

  if (usage >= FREE_TIER.MONTHLY_LIMIT) {
    return res.status(429).json({
      error: 'free_tier_exhausted',
      used: usage,
      limit: FREE_TIER.MONTHLY_LIMIT,
      message: `Free tier limit reached (${FREE_TIER.MONTHLY_LIMIT}/month). Use enrich_product ($0.02) for paid access, or wait for next month.`,
      upgrade: { tool: 'enrich_product', price_usd: 0.02, endpoint: '/api/enrich' },
    });
  }

  const rawThresholdBasic = req.body?.strict_confidence_threshold ?? req.query?.strict_confidence_threshold;
  const thresholdBasic = rawThresholdBasic != null ? parseFloat(String(rawThresholdBasic)) : undefined;
  const formatBasic = parseFormat(req);
  const optionsBasic: EnrichmentOptions = {
    strict_confidence_threshold: (thresholdBasic != null && !isNaN(thresholdBasic)) ? thresholdBasic : undefined,
    format: formatBasic,
  };

  try {
    const product = await extractBasicFromUrl(url, optionsBasic);
    freeTier.increment(clientId);
    cache.set(url, product);

    const hasData = product.product_name !== null;

    if (formatBasic === 'ucp') {
      const ucpResult = mapToUcp(product, optionsBasic);
      if (!ucpResult.valid) {
        return res.json({ ...ucpResult, cached: false, free_tier: { used: usage + 1, limit: FREE_TIER.MONTHLY_LIMIT } });
      }
      return res.json({
        line_item: ucpResult.line_item,
        cached: false,
        free_tier: { used: usage + 1, limit: FREE_TIER.MONTHLY_LIMIT },
      });
    }

    res.json({
      product,
      cached: false,
      free_tier: { used: usage + 1, limit: FREE_TIER.MONTHLY_LIMIT },
      ...(hasData ? {} : {
        upgrade_hint: 'No Schema.org data found. Use /api/enrich ($0.02) for LLM-powered extraction.',
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Extraction failed';
    res.status(500).json({ error: 'extraction_failed', message });
  }
});

// POST /api/enrich — Full extraction (Schema.org → LLM → browser fallback)
app.post('/api/enrich', async (req, res) => {
  const { url, payment_method_id } = req.body ?? {};
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing required field: url' });
  }

  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  // ── API key auth path (paid tiers skip MPP) ──
  if (req.customer && redis && req.customer.tier !== 'free') {
    const limit = await checkLimit(redis, req.customer.id, req.customer.tier);
    if (!limit.allowed) {
      return res.status(429).json({
        error: 'tier_limit_exhausted',
        used: limit.used,
        limit: limit.limit,
        tier: req.customer.tier,
        message: `Monthly limit reached (${limit.limit}/month on ${req.customer.tier} tier).`,
      });
    }

    const cached = cache.get(url);
    if (cached) {
      return res.json({ product: cached, cached: true });
    }

    try {
      const product = await extractProduct(url);
      await incrementUsage(redis, req.customer.id);
      cache.set(url, product);

      const usage = await getUsageSummary(redis, req.customer.id, req.customer.tier);
      return res.json({ product, cached: false, usage });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Extraction failed';
      return res.status(500).json({ error: 'extraction_failed', message });
    }
  }

  // ── MPP payment path (unchanged) ──
  if (!payment_method_id) {
    const payments = getPayments();
    return res.status(402).json({
      error: 'payment_required',
      status: 402,
      challenge: payments.createChallenge('enrich_product'),
      message: 'Payment required. Include payment_method_id in request body. Cost: $0.02',
      free_alternative: { endpoint: '/api/enrich/basic', description: 'Schema.org only, 500 free calls/month' },
    });
  }

  const payments = getPayments();
  let receipt;
  try {
    receipt = await payments.processPayment('enrich_product', payment_method_id);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Payment processing failed';
    return res.status(402).json({ error: 'payment_failed', message });
  }

  const cached = cache.get(url);
  if (cached) {
    return res.json({ product: cached, cached: true, receipt });
  }

  const rawThresholdEnrich = req.body?.strict_confidence_threshold ?? req.query?.strict_confidence_threshold;
  const thresholdEnrich = rawThresholdEnrich != null ? parseFloat(String(rawThresholdEnrich)) : undefined;
  const formatEnrich = parseFormat(req);
  const optionsEnrich: EnrichmentOptions = {
    strict_confidence_threshold: (thresholdEnrich != null && !isNaN(thresholdEnrich)) ? thresholdEnrich : undefined,
    format: formatEnrich,
  };

  try {
    const product = await extractProduct(url, optionsEnrich);
    cache.set(url, product);

    if (formatEnrich === 'ucp') {
      const ucpResult = mapToUcp(product, optionsEnrich);
      if (!ucpResult.valid) {
        return res.json({ ...ucpResult, receipt, cached: false });
      }
      return res.json({ line_item: ucpResult.line_item, receipt, cached: false });
    }

    res.json({ product, receipt, cached: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Extraction failed';
    res.status(500).json({ error: 'extraction_failed', message, receipt });
  }
});

// POST /api/enrich/html — Full extraction from raw HTML
app.post('/api/enrich/html', async (req, res) => {
  const { html, url, payment_method_id } = req.body ?? {};
  if (!html || typeof html !== 'string') {
    return res.status(400).json({ error: 'Missing required field: html' });
  }
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing required field: url (original page URL for context)' });
  }

  // ── API key auth path (paid tiers skip MPP) ──
  if (req.customer && redis && req.customer.tier !== 'free') {
    const limit = await checkLimit(redis, req.customer.id, req.customer.tier);
    if (!limit.allowed) {
      return res.status(429).json({
        error: 'tier_limit_exhausted',
        used: limit.used,
        limit: limit.limit,
        tier: req.customer.tier,
        message: `Monthly limit reached (${limit.limit}/month on ${req.customer.tier} tier).`,
      });
    }

    const cached = cache.get(url);
    if (cached) {
      return res.json({ product: cached, cached: true });
    }

    try {
      const product = await extractFromRawHtml(html, url);
      await incrementUsage(redis, req.customer.id);
      cache.set(url, product);

      const usage = await getUsageSummary(redis, req.customer.id, req.customer.tier);
      return res.json({ product, cached: false, usage });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Extraction failed';
      return res.status(500).json({ error: 'extraction_failed', message });
    }
  }

  // ── MPP payment path (unchanged) ──
  if (!payment_method_id) {
    const payments = getPayments();
    return res.status(402).json({
      error: 'payment_required',
      status: 402,
      challenge: payments.createChallenge('enrich_html'),
      message: 'Payment required. Include payment_method_id in request body. Cost: $0.02',
    });
  }

  const payments = getPayments();
  let receipt;
  try {
    receipt = await payments.processPayment('enrich_html', payment_method_id);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Payment processing failed';
    return res.status(402).json({ error: 'payment_failed', message });
  }

  const cached = cache.get(url);
  if (cached) {
    return res.json({ product: cached, cached: true, receipt });
  }

  const rawThresholdHtml = req.body?.strict_confidence_threshold ?? req.query?.strict_confidence_threshold;
  const thresholdHtml = rawThresholdHtml != null ? parseFloat(String(rawThresholdHtml)) : undefined;
  const formatHtml = parseFormat(req);
  const optionsHtml: EnrichmentOptions = {
    strict_confidence_threshold: (thresholdHtml != null && !isNaN(thresholdHtml)) ? thresholdHtml : undefined,
    format: formatHtml,
  };

  try {
    const product = await extractFromRawHtml(html, url, optionsHtml);
    cache.set(url, product);

    if (formatHtml === 'ucp') {
      const ucpResult = mapToUcp(product, optionsHtml);
      if (!ucpResult.valid) {
        return res.json({ ...ucpResult, receipt, cached: false });
      }
      return res.json({ line_item: ucpResult.line_item, receipt, cached: false });
    }

    res.json({ product, receipt, cached: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Extraction failed';
    res.status(500).json({ error: 'extraction_failed', message, receipt });
  }
});

// Admin: create API key (gated behind CRON_SECRET)
app.post('/api/admin/create-key', async (req, res) => {
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { email, tier = 'free' } = req.body ?? {};
  if (!email) return res.status(400).json({ error: 'email required' });

  const redisClient = getRedis();
  if (!redisClient) return res.status(500).json({ error: 'Redis not configured' });

  const { generateApiKey, hashApiKey, storeApiKey } = await import('../src/api-keys.js');
  const apiKey = generateApiKey();
  const customer: Customer = {
    id: randomUUID(),
    email,
    tier: tier as SubscriptionTier,
    apiKeyHash: hashApiKey(apiKey),
    createdAt: new Date().toISOString(),
  };

  await storeApiKey(redisClient, customer.apiKeyHash, customer);
  await redisClient.set(`customer:${customer.id}`, JSON.stringify(customer));
  await redisClient.set(`customer:email:${email}`, customer.id);

  res.json({ apiKey, customerId: customer.id, tier, message: 'Store this API key — it cannot be retrieved later.' });
});

// MCP endpoint
app.post('/mcp', async (req, res) => {
  try {
    const payments = getPayments();
    const server = createServer(cache, payments);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on('close', () => {
      transport.close();
      server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('MCP request error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

app.get('/mcp', (_req, res) => {
  res.writeHead(405).end(JSON.stringify({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed. Use POST.' },
    id: null,
  }));
});

app.delete('/mcp', (_req, res) => {
  res.writeHead(405).end(JSON.stringify({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed.' },
    id: null,
  }));
});

export default app;
