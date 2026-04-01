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
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from '../src/server.js';
import { EnrichmentCache } from '../src/cache.js';
import { PaymentManager } from '../src/payments.js';
import { getDashboardStats, getDashboardStatsAsync } from '../src/stats.js';
import { runDailyTests } from '../src/test-runner.js';
import { runHealthCheck } from '../src/health.js';
import { verifyUrl } from '../src/verify-url.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const testCorpus = require('../data/test-corpus.json') as Array<{ url: string; vertical: string; added: string }>;

const app = express();
app.use(express.json());

const cache = new EnrichmentCache();

function getPayments() {
  return new PaymentManager(
    process.env.STRIPE_SECRET_KEY || process.env.STRIPE_TEST_SECRET_KEY
  );
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
    free_tier: '200 enrich_basic calls/month — no payment required',
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
