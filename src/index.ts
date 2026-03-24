import 'dotenv/config';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { EnrichmentCache } from './cache.js';
import { PaymentManager } from './payments.js';

async function main() {
  // Validate required env vars (do NOT log values)
  if (!process.env.STRIPE_TEST_SECRET_KEY) {
    console.error('Missing STRIPE_TEST_SECRET_KEY in environment');
    process.exit(1);
  }
  if (!process.env.GOOGLE_API_KEY) {
    console.error('Missing GOOGLE_API_KEY in environment');
    process.exit(1);
  }

  // Initialize components
  const cache = new EnrichmentCache();
  const payments = new PaymentManager();
  const server = createServer(cache, payments);

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr (stdout is for MCP protocol)
  console.error('ShopGraph MCP server started');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
