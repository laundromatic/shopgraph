/**
 * HTTP server entry point for remote deployment.
 * Exposes the MCP server via Streamable HTTP transport
 * so agents on the internet can connect.
 *
 * Usage:
 *   npm run start:http    (production)
 *   npm run dev:http      (development)
 */
import 'dotenv/config';
import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './server.js';
import { EnrichmentCache } from './cache.js';
import { PaymentManager } from './payments.js';

const PORT = parseInt(process.env.PORT || '3000', 10);

async function main() {
  // Validate env
  if (!process.env.STRIPE_TEST_SECRET_KEY && !process.env.STRIPE_SECRET_KEY) {
    console.error('Missing STRIPE_TEST_SECRET_KEY or STRIPE_SECRET_KEY');
    process.exit(1);
  }
  if (!process.env.GOOGLE_API_KEY) {
    console.error('Missing GOOGLE_API_KEY');
    process.exit(1);
  }

  const app = express();
  app.use(express.json());

  // Health check
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'shopgraph',
      version: '1.0.0',
      tools: ['enrich_product', 'enrich_basic'],
    });
  });

  // Initialize shared components
  const cache = new EnrichmentCache();
  const payments = new PaymentManager(
    process.env.STRIPE_SECRET_KEY || process.env.STRIPE_TEST_SECRET_KEY
  );

  // MCP endpoint — handles Streamable HTTP transport
  app.post('/mcp', async (req, res) => {
    try {
      const server = createServer(cache, payments);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless
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

  // Handle GET/DELETE for SSE streams (required by spec)
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

  app.listen(PORT, () => {
    console.log(`ShopGraph MCP server listening on port ${PORT}`);
    console.log(`  Health: http://localhost:${PORT}/health`);
    console.log(`  MCP:    http://localhost:${PORT}/mcp`);
  });
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
