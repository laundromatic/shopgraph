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
import { scoreAgentReadiness } from '../src/agent-ready.js';
import { getDashboardStats, getDashboardStatsAsync } from '../src/stats.js';
import { runDailyTests } from '../src/test-runner.js';
import { runHealthCheck } from '../src/health.js';
import { verifyUrl } from '../src/verify-url.js';
import { getRedis } from '../src/redis.js';
import { createAuthMiddleware } from '../src/auth-middleware.js';
import { checkLimit, incrementUsage, getUsageSummary } from '../src/subscriptions.js';
import { checkRateLimit } from '../src/rate-limiter.js';
import { createMagicLink, verifyMagicLink, findOrCreateCustomer } from '../src/auth.js';
import { generateApiKey, hashApiKey, storeApiKey, revokeApiKey } from '../src/api-keys.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const testCorpus = require('../data/test-corpus.json') as Array<{ url: string; vertical: string; added: string }>;

const app = express();

// ---------------------------------------------------------------------------
// Stripe webhook needs raw body BEFORE express.json() is applied
// ---------------------------------------------------------------------------
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const redisClient = getRedis();
  if (!redisClient) return res.status(500).json({ error: 'Redis not configured' });

  const signature = req.headers['stripe-signature'] as string | undefined;
  if (!signature) return res.status(400).json({ error: 'Missing stripe-signature header' });

  let event;
  try {
    const payments = getPayments();
    event = payments.verifyWebhookSignature(req.body as Buffer, signature);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook signature verification failed';
    console.error('[billing/webhook] signature error:', message);
    return res.status(400).json({ error: message });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Record<string, unknown>;
        const shopgraphCustomerId = (session.metadata as Record<string, string>)?.shopgraph_customer_id;
        const stripeCustomerId = session.customer as string;

        if (shopgraphCustomerId && stripeCustomerId) {
          const raw = await redisClient.get<string>(`customer:${shopgraphCustomerId}`);
          if (raw) {
            const customer: Customer = typeof raw === 'string' ? JSON.parse(raw) : raw as unknown as Customer;
            customer.stripeCustomerId = stripeCustomerId;
            // Default to starter on first checkout — subscription.updated will refine
            if (customer.tier === 'free') customer.tier = 'starter';
            await redisClient.set(`customer:${customer.id}`, JSON.stringify(customer));
            await redisClient.set(`apikey:${customer.apiKeyHash}`, JSON.stringify(customer));
            // Store reverse lookup for webhook handlers
            await redisClient.set(`stripe:customer:${stripeCustomerId}`, customer.id);
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Record<string, unknown>;
        const stripeCustomerId = subscription.customer as string;
        const items = subscription.items as { data: Array<{ price: { id: string } }> };
        const priceId = items?.data?.[0]?.price?.id;

        // Map price ID to tier
        let newTier: SubscriptionTier = 'free';
        if (priceId === process.env.STRIPE_PRICE_STARTER) newTier = 'starter';
        else if (priceId === process.env.STRIPE_PRICE_GROWTH) newTier = 'growth';

        // Find customer by stripeCustomerId (scan is expensive; store reverse lookup)
        await updateCustomerTierByStripe(redisClient, stripeCustomerId, newTier);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Record<string, unknown>;
        const stripeCustomerId = subscription.customer as string;
        await updateCustomerTierByStripe(redisClient, stripeCustomerId, 'free');
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Record<string, unknown>;
        const stripeCustomerId = invoice.customer as string;
        // Flag the account by storing a payment_failed marker
        if (stripeCustomerId) {
          await redisClient.set(`stripe:payment_failed:${stripeCustomerId}`, new Date().toISOString(), { ex: 30 * 24 * 60 * 60 });
        }
        break;
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('[billing/webhook] handler error:', err);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

/** Helper: update customer tier by Stripe customer ID */
async function updateCustomerTierByStripe(redisClient: NonNullable<ReturnType<typeof getRedis>>, stripeCustomerId: string, tier: SubscriptionTier) {
  // Look up customer via reverse mapping
  const customerId = await redisClient.get<string>(`stripe:customer:${stripeCustomerId}`);
  if (!customerId) return;

  const raw = await redisClient.get<string>(`customer:${customerId}`);
  if (!raw) return;

  const customer: Customer = typeof raw === 'string' ? JSON.parse(raw) : raw as unknown as Customer;
  customer.tier = tier;
  await redisClient.set(`customer:${customer.id}`, JSON.stringify(customer));
  await redisClient.set(`apikey:${customer.apiKeyHash}`, JSON.stringify(customer));
}

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

/** Parse include_score option from request body or query string. */
function parseIncludeScore(req: express.Request): boolean {
  return req.body?.include_score === true || req.query?.include_score === 'true';
}

// ---------------------------------------------------------------------------
// Rate limiting middleware — applies to enrichment routes
// ---------------------------------------------------------------------------
async function rateLimitGuard(req: express.Request, res: express.Response): Promise<boolean> {
  if (!redis) return false; // no Redis = no rate limiting
  const tier: SubscriptionTier = req.customer?.tier ?? 'free';
  const clientId = req.customer?.apiKeyHash
    ?? (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    ?? req.ip
    ?? 'anonymous';

  const result = await checkRateLimit(redis, clientId, tier);
  if (!result.allowed) {
    res.status(429).json({
      error: 'rate_limit_exceeded',
      limit: result.limit,
      retry_after_ms: 1000,
      tier,
      message: `Rate limit exceeded (${result.limit} req/sec on ${tier} tier). Upgrade for higher limits.`,
    });
    return true; // blocked
  }
  return false; // allowed
}

// ---------------------------------------------------------------------------
// Auth routes — magic link signup flow
// ---------------------------------------------------------------------------

// POST /api/auth/signup — generate magic link token
app.post('/api/auth/signup', async (req, res) => {
  const { email } = req.body ?? {};
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Missing required field: email' });
  }

  const redisClient = getRedis();
  if (!redisClient) return res.status(500).json({ error: 'Redis not configured' });

  try {
    const token = await createMagicLink(redisClient, email);
    // TODO: Send email with magic link using Resend or similar service
    // For now, return token directly so it can be tested
    res.json({ ok: true, message: 'Check your email', token });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create magic link';
    res.status(500).json({ error: message });
  }
});

// GET /api/auth/verify — verify magic link token, create/find customer
app.get('/api/auth/verify', async (req, res) => {
  const token = req.query.token as string;
  if (!token) {
    return res.status(400).json({ error: 'Missing token query parameter' });
  }

  const redisClient = getRedis();
  if (!redisClient) return res.status(500).json({ error: 'Redis not configured' });

  try {
    const email = await verifyMagicLink(redisClient, token);
    if (!email) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const { customer, apiKey } = await findOrCreateCustomer(redisClient, email);
    res.json({ customer, ...(apiKey ? { apiKey } : {}) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Verification failed';
    res.status(500).json({ error: message });
  }
});

// POST /api/auth/api-key/regenerate — revoke old key, generate new one (requires auth)
app.post('/api/auth/api-key/regenerate', async (req, res) => {
  if (!req.customer) return res.status(401).json({ error: 'API key required' });

  const redisClient = getRedis();
  if (!redisClient) return res.status(500).json({ error: 'Redis not configured' });

  try {
    // Revoke old key
    await revokeApiKey(redisClient, req.customer.apiKeyHash);

    // Generate new key
    const newApiKey = generateApiKey();
    const newHash = hashApiKey(newApiKey);

    // Update customer record
    const updatedCustomer: Customer = { ...req.customer, apiKeyHash: newHash };
    await storeApiKey(redisClient, newHash, updatedCustomer);
    await redisClient.set(`customer:${updatedCustomer.id}`, JSON.stringify(updatedCustomer));

    res.json({ apiKey: newApiKey, message: 'Store this API key — it cannot be retrieved later.' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Key regeneration failed';
    res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// Billing routes
// ---------------------------------------------------------------------------

// POST /api/billing/checkout — create Stripe Checkout Session
app.post('/api/billing/checkout', async (req, res) => {
  if (!req.customer) return res.status(401).json({ error: 'API key required' });

  const { tier } = req.body ?? {};
  if (!tier || !['starter', 'growth'].includes(tier)) {
    return res.status(400).json({ error: 'Invalid tier. Must be "starter" or "growth".' });
  }

  try {
    const payments = getPayments();
    const url = await payments.createSubscriptionCheckout(tier, req.customer.email, req.customer.id);

    // Store Stripe reverse lookup when we know the customer
    if (redis && req.customer.stripeCustomerId) {
      await redis.set(`stripe:customer:${req.customer.stripeCustomerId}`, req.customer.id);
    }

    res.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Checkout session creation failed';
    res.status(500).json({ error: message });
  }
});

// POST /api/billing/portal — create Stripe Customer Portal session
app.post('/api/billing/portal', async (req, res) => {
  if (!req.customer) return res.status(401).json({ error: 'API key required' });
  if (!req.customer.stripeCustomerId) {
    return res.status(400).json({ error: 'No Stripe customer linked. Subscribe first via /api/billing/checkout.' });
  }

  try {
    const payments = getPayments();
    const url = await payments.createCustomerPortal(req.customer.stripeCustomerId);
    res.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Portal session creation failed';
    res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// Dashboard data route
// ---------------------------------------------------------------------------

// GET /api/dashboard/usage — returns usage data for authenticated customer
app.get('/api/dashboard/usage', async (req, res) => {
  if (!req.customer) return res.status(401).json({ error: 'API key required' });

  const redisClient = getRedis();
  if (!redisClient) return res.status(500).json({ error: 'Redis not configured' });

  try {
    const usage = await getUsageSummary(redisClient, req.customer.id, req.customer.tier);
    const tierConfig = TIER_CONFIGS[req.customer.tier];

    // Mask API key: show prefix + first 4 chars + last 4 chars
    const maskedKey = `sg_live_${'*'.repeat(24)}`;

    res.json({
      email: req.customer.email,
      tier: req.customer.tier,
      tierName: tierConfig.name,
      usage: usage.used,
      limit: usage.limit,
      remaining: usage.remaining,
      rateLimit: tierConfig.rateLimit,
      apiKeyMasked: maskedKey,
      stripeCustomerId: req.customer.stripeCustomerId ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch usage data';
    res.status(500).json({ error: message });
  }
});

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

// GET /api/stats/fields — per-field extraction rates + confidence
app.get('/api/stats/fields', async (_req, res) => {
  const redis = getRedis();
  if (!redis) return res.json({ error: 'Redis not configured' });
  const fieldStats = await redis.get('stats:field_stats');
  res.json(fieldStats ?? { fields: [] });
});

// GET /api/stats/segments — B2B vs B2C breakdown
app.get('/api/stats/segments', async (_req, res) => {
  const redis = getRedis();
  if (!redis) return res.json({ error: 'Redis not configured' });
  const segmentStats = await redis.get('stats:segments');
  res.json(segmentStats ?? { b2b: null, b2c: null });
});

// GET /api/stats/calibration — confidence calibration report
app.get('/api/stats/calibration', async (_req, res) => {
  const redis = getRedis();
  if (!redis) return res.json({ error: 'Redis not configured' });
  const report = await redis.get('stats:calibration');
  res.json(report ?? { recommendation: 'insufficient_data', sample_size: 0 });
});

// POST /api/run-calibration — manual trigger for calibration report
app.post('/api/run-calibration', async (req, res) => {
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const redis = getRedis();
  if (!redis) return res.status(500).json({ error: 'Redis not configured' });
  const { generateCalibrationReport } = await import('../src/calibration.js');
  const report = await generateCalibrationReport(redis);
  res.json(report);
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

// POST /api/score — extraction + agent-readiness scoring
app.post('/api/score', async (req, res) => {
  if (await rateLimitGuard(req, res)) return;

  const { url, payment_method_id } = req.body ?? {};
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing required field: url' });
  }

  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  const rawThreshold = req.body?.strict_confidence_threshold ?? req.query?.strict_confidence_threshold;
  const threshold = rawThreshold != null ? parseFloat(String(rawThreshold)) : undefined;
  const format = parseFormat(req);
  const options: EnrichmentOptions = {
    strict_confidence_threshold: (threshold != null && !isNaN(threshold)) ? threshold : undefined,
    format,
    include_score: true,
  };

  // ── API key auth path ──
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
      const score = scoreAgentReadiness(cached);
      if (format === 'ucp') {
        const ucpResult = mapToUcp(cached, options);
        return res.json({ ...ucpResult, score, cached: true });
      }
      return res.json({ product: cached, score, cached: true });
    }

    try {
      const product = await extractProduct(url, options);
      await incrementUsage(redis, req.customer.id);
      cache.set(url, product);

      const score = scoreAgentReadiness(product);
      const usage = await getUsageSummary(redis, req.customer.id, req.customer.tier);
      if (format === 'ucp') {
        const ucpResult = mapToUcp(product, options);
        return res.json({ ...ucpResult, score, cached: false, usage });
      }
      return res.json({ product, score, cached: false, usage });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Extraction failed';
      return res.status(500).json({ error: 'extraction_failed', message });
    }
  }

  // ── MPP payment path ──
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
    const score = scoreAgentReadiness(cached);
    if (format === 'ucp') {
      const ucpResult = mapToUcp(cached, options);
      return res.json({ ...ucpResult, score, receipt, cached: true });
    }
    return res.json({ product: cached, score, receipt, cached: true });
  }

  try {
    const product = await extractProduct(url, options);
    cache.set(url, product);
    const score = scoreAgentReadiness(product);

    if (format === 'ucp') {
      const ucpResult = mapToUcp(product, options);
      if (!ucpResult.valid) {
        return res.json({ ...ucpResult, score, receipt, cached: false });
      }
      return res.json({ line_item: ucpResult.line_item, score, receipt, cached: false });
    }

    res.json({ product, score, receipt, cached: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Extraction failed';
    res.status(500).json({ error: 'extraction_failed', message, receipt });
  }
});

// POST /api/enrich/basic — Schema.org only, free tier eligible
app.post('/api/enrich/basic', async (req, res) => {
  if (await rateLimitGuard(req, res)) return;

  const { url } = req.body ?? {};
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing required field: url' });
  }

  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  // Parse options early — needed for both cached and fresh results
  const rawThresholdEarly = req.body?.strict_confidence_threshold ?? req.query?.strict_confidence_threshold;
  const thresholdEarly = rawThresholdEarly != null ? parseFloat(String(rawThresholdEarly)) : undefined;
  const formatEarly = parseFormat(req);
  const includeScoreBasic = parseIncludeScore(req);
  const optionsEarly: EnrichmentOptions = {
    strict_confidence_threshold: (thresholdEarly != null && !isNaN(thresholdEarly)) ? thresholdEarly : undefined,
    format: formatEarly,
    include_score: includeScoreBasic,
  };

  // Check cache first
  const cached = cache.get(url);
  if (cached) {
    // Re-apply threshold and format to cached results
    const product = { ...cached, image_urls: [], primary_image_url: null };
    const scoreData = includeScoreBasic ? { score: scoreAgentReadiness(product) } : {};
    if (formatEarly === 'ucp') {
      const ucpResult = mapToUcp(product, optionsEarly);
      return res.json({ ...ucpResult, ...scoreData, cached: true });
    }
    return res.json({ product, ...scoreData, cached: true });
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
      const product = await extractBasicFromUrl(url, optionsEarly);
      await incrementUsage(redis, req.customer.id);
      cache.set(url, product);

      const usage = await getUsageSummary(redis, req.customer.id, req.customer.tier);
      const hasData = product.product_name !== null;
      const scoreData = includeScoreBasic ? { score: scoreAgentReadiness(product) } : {};

      if (formatEarly === 'ucp') {
        const ucpResult = mapToUcp(product, optionsEarly);
        return res.json({ ...ucpResult, ...scoreData, cached: false, usage });
      }

      return res.json({
        product,
        ...scoreData,
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

  // ── IP-based free tier path ──
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
    const scoreDataBasic = includeScoreBasic ? { score: scoreAgentReadiness(product) } : {};

    if (formatBasic === 'ucp') {
      const ucpResult = mapToUcp(product, optionsBasic);
      if (!ucpResult.valid) {
        return res.json({ ...ucpResult, ...scoreDataBasic, cached: false, free_tier: { used: usage + 1, limit: FREE_TIER.MONTHLY_LIMIT } });
      }
      return res.json({
        line_item: ucpResult.line_item,
        ...scoreDataBasic,
        cached: false,
        free_tier: { used: usage + 1, limit: FREE_TIER.MONTHLY_LIMIT },
      });
    }

    res.json({
      product,
      ...scoreDataBasic,
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
  if (await rateLimitGuard(req, res)) return;

  const { url, payment_method_id } = req.body ?? {};
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing required field: url' });
  }

  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  // Parse options early for all paths
  const rawThresholdEnrich = req.body?.strict_confidence_threshold ?? req.query?.strict_confidence_threshold;
  const thresholdEnrich = rawThresholdEnrich != null ? parseFloat(String(rawThresholdEnrich)) : undefined;
  const formatEnrich = parseFormat(req);
  const includeScoreEnrich = parseIncludeScore(req);
  const optionsEnrich: EnrichmentOptions = {
    strict_confidence_threshold: (thresholdEnrich != null && !isNaN(thresholdEnrich)) ? thresholdEnrich : undefined,
    format: formatEnrich,
    include_score: includeScoreEnrich,
  };

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
      const scoreEnrichCached = includeScoreEnrich ? { score: scoreAgentReadiness(cached) } : {};
      if (formatEnrich === 'ucp') {
        const ucpResult = mapToUcp(cached, optionsEnrich);
        return res.json({ ...ucpResult, ...scoreEnrichCached, cached: true });
      }
      return res.json({ product: cached, ...scoreEnrichCached, cached: true });
    }

    try {
      const product = await extractProduct(url, optionsEnrich);
      await incrementUsage(redis, req.customer.id);
      cache.set(url, product);

      const usage = await getUsageSummary(redis, req.customer.id, req.customer.tier);
      const scoreEnrichAuth = includeScoreEnrich ? { score: scoreAgentReadiness(product) } : {};
      if (formatEnrich === 'ucp') {
        const ucpResult = mapToUcp(product, optionsEnrich);
        return res.json({ ...ucpResult, ...scoreEnrichAuth, cached: false, usage });
      }
      return res.json({ product, ...scoreEnrichAuth, cached: false, usage });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Extraction failed';
      return res.status(500).json({ error: 'extraction_failed', message });
    }
  }

  // ── MPP payment path ──
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
    const scoreEnrichMppCached = includeScoreEnrich ? { score: scoreAgentReadiness(cached) } : {};
    if (formatEnrich === 'ucp') {
      const ucpResult = mapToUcp(cached, optionsEnrich);
      return res.json({ ...ucpResult, ...scoreEnrichMppCached, receipt, cached: true });
    }
    return res.json({ product: cached, ...scoreEnrichMppCached, cached: true, receipt });
  }

  try {
    const product = await extractProduct(url, optionsEnrich);
    cache.set(url, product);
    const scoreEnrichMpp = includeScoreEnrich ? { score: scoreAgentReadiness(product) } : {};

    if (formatEnrich === 'ucp') {
      const ucpResult = mapToUcp(product, optionsEnrich);
      if (!ucpResult.valid) {
        return res.json({ ...ucpResult, ...scoreEnrichMpp, receipt, cached: false });
      }
      return res.json({ line_item: ucpResult.line_item, ...scoreEnrichMpp, receipt, cached: false });
    }

    res.json({ product, ...scoreEnrichMpp, receipt, cached: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Extraction failed';
    res.status(500).json({ error: 'extraction_failed', message, receipt });
  }
});

// POST /api/enrich/html — Full extraction from raw HTML
app.post('/api/enrich/html', async (req, res) => {
  if (await rateLimitGuard(req, res)) return;

  const { html, url, payment_method_id } = req.body ?? {};
  if (!html || typeof html !== 'string') {
    return res.status(400).json({ error: 'Missing required field: html' });
  }
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing required field: url (original page URL for context)' });
  }

  // Parse options early for all paths
  const rawThresholdHtml = req.body?.strict_confidence_threshold ?? req.query?.strict_confidence_threshold;
  const thresholdHtml = rawThresholdHtml != null ? parseFloat(String(rawThresholdHtml)) : undefined;
  const formatHtml = parseFormat(req);
  const optionsHtml: EnrichmentOptions = {
    strict_confidence_threshold: (thresholdHtml != null && !isNaN(thresholdHtml)) ? thresholdHtml : undefined,
    format: formatHtml,
  };

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
      if (formatHtml === 'ucp') {
        const ucpResult = mapToUcp(cached, optionsHtml);
        return res.json({ ...ucpResult, cached: true });
      }
      return res.json({ product: cached, cached: true });
    }

    try {
      const product = await extractFromRawHtml(html, url, optionsHtml);
      await incrementUsage(redis, req.customer.id);
      cache.set(url, product);

      const usage = await getUsageSummary(redis, req.customer.id, req.customer.tier);
      if (formatHtml === 'ucp') {
        const ucpResult = mapToUcp(product, optionsHtml);
        return res.json({ ...ucpResult, cached: false, usage });
      }
      return res.json({ product, cached: false, usage });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Extraction failed';
      return res.status(500).json({ error: 'extraction_failed', message });
    }
  }

  // ── MPP payment path ──
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
    if (formatHtml === 'ucp') {
      const ucpResult = mapToUcp(cached, optionsHtml);
      return res.json({ ...ucpResult, receipt, cached: true });
    }
    return res.json({ product: cached, cached: true, receipt });
  }

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
