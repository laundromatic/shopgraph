/**
 * End-to-end test: calls the enrichment server via MCP client,
 * tests the 402 challenge flow, and verifies extraction works.
 *
 * Usage: npx tsx scripts/test-e2e.ts
 */
import 'dotenv/config';
import Stripe from 'stripe';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const TEST_URL = 'https://www.allbirds.com/products/mens-tree-runners'; // Shopify store with schema.org

async function main() {
  console.log('=== Product Enrichment MCP E2E Test ===\n');

  // 1. Start MCP server as child process
  console.log('1. Starting MCP server...');
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['dist/index.js'],
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
  });

  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(transport);
  console.log('   Server connected.\n');

  // 2. List available tools
  console.log('2. Listing tools...');
  const tools = await client.listTools();
  console.log(`   Found ${tools.tools.length} tools:`);
  for (const tool of tools.tools) {
    console.log(`   - ${tool.name}: ${tool.description?.slice(0, 80)}...`);
  }
  console.log();

  // 3. Call enrich_basic WITHOUT payment (expect 402 challenge)
  console.log('3. Calling enrich_basic without payment (expect 402)...');
  const challengeResult = await client.callTool({
    name: 'enrich_basic',
    arguments: { url: TEST_URL },
  });

  const challengeText = (challengeResult.content as Array<{type: string; text: string}>)[0].text;
  const challengeData = JSON.parse(challengeText);

  if (challengeData.error === 'payment_required') {
    console.log(`   Got 402 challenge: ${challengeData.challenge.description}`);
    console.log(`   Amount: $${(challengeData.challenge.amount / 100).toFixed(2)}`);
  } else {
    console.log('   ERROR: Expected 402 but got:', challengeData);
  }
  console.log();

  // 4. Create a test payment method via Stripe (using test token)
  console.log('4. Creating test payment method...');
  const stripe = new Stripe(process.env.STRIPE_TEST_SECRET_KEY!);
  const pm = await stripe.paymentMethods.create({
    type: 'card',
    card: { token: 'tok_visa' },
  });
  console.log(`   Payment method created: ${pm.id}\n`);

  // 5. Call enrich_basic WITH payment
  console.log('5. Calling enrich_basic with payment...');
  const paidResult = await client.callTool({
    name: 'enrich_basic',
    arguments: { url: TEST_URL, payment_method_id: pm.id },
  });

  const paidText = (paidResult.content as Array<{type: string; text: string}>)[0].text;
  const paidData = JSON.parse(paidText);

  if (paidData.product) {
    console.log('   Enrichment successful!');
    console.log(`   Product: ${paidData.product.product_name}`);
    console.log(`   Brand: ${paidData.product.brand}`);
    console.log(`   Price: ${paidData.product.price?.amount} ${paidData.product.price?.currency}`);
    console.log(`   Availability: ${paidData.product.availability}`);
    console.log(`   Method: ${paidData.product.extraction_method}`);
    console.log(`   Confidence: ${paidData.product.confidence?.overall}`);
    if (paidData.receipt) {
      console.log(`   Payment: ${paidData.receipt.payment_intent_id} (${paidData.receipt.status})`);
    }
  } else if (paidData.error) {
    console.log(`   Error: ${paidData.error} — ${paidData.message}`);
  }
  console.log();

  // 6. Call again (should be cached, free)
  console.log('6. Calling again (should be cached, free)...');
  const cachedResult = await client.callTool({
    name: 'enrich_basic',
    arguments: { url: TEST_URL },
  });

  const cachedText = (cachedResult.content as Array<{type: string; text: string}>)[0].text;
  const cachedData = JSON.parse(cachedText);

  if (cachedData.cached) {
    console.log('   Cache hit! No payment needed.');
    console.log(`   Product: ${cachedData.product.product_name}`);
  } else if (cachedData.error === 'payment_required') {
    console.log('   Not cached — got 402 again (cache may not persist across calls in stdio mode)');
  }
  console.log();

  // Cleanup
  await client.close();
  console.log('=== Test complete ===');
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
