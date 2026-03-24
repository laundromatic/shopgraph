# @laundromatic/shopgraph

MCP server for product data enrichment with Stripe MPP (Machine Payments Protocol) payment gating.

## What it does

Agents connect via Model Context Protocol and call enrichment tools to extract structured product data from URLs. Requests are payment-gated via Stripe: unauthenticated calls receive a 402 challenge, authenticated calls with a `payment_method_id` are processed and billed.

## Architecture

```
Agent → MCP (stdio) → enrich_product / enrich_basic
  → Cache hit? Return immediately (free)
  → No payment_method_id? Return 402 + MPP challenge
  → Payment confirmed → schema.org extraction (fast, 0.95 confidence)
  → No structured data? → Gemini LLM fallback (0.6-0.8 confidence)
  → Return ProductData + PaymentReceipt
```

## Setup

```bash
npm install
```

Required environment variables in `.env`:

| Variable | Purpose |
|----------|---------|
| `STRIPE_TEST_SECRET_KEY` | Stripe test mode secret key |
| `GOOGLE_API_KEY` | Gemini API key for LLM fallback |

**Note**: Check `.env` for duplicate key definitions — `dotenv` uses the last occurrence.

## Build & Run

```bash
npm run build          # Compile TypeScript
npm start              # Run MCP server (stdio transport)
npm run dev            # Run with tsx (no build needed)
```

## Test

```bash
npm run test:run       # Run all tests once
npm test               # Run tests in watch mode
```

## Tools

| Tool | Price | Description |
|------|-------|-------------|
| `enrich_product` | $0.02 | Full product data extraction |
| `enrich_basic` | $0.01 | Basic attributes only (no images) |

Cached results are returned free of charge (24-hour TTL).

## MCP Configuration

Add to your MCP client config:

```json
{
  "mcpServers": {
    "shopgraph": {
      "command": "node",
      "args": ["/path/to/shopgraph/dist/index.js"]
    }
  }
}
```
