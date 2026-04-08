# ShopGraph

Product data structuring layer for AI agents. Send a URL or raw HTML, get clean structured JSON with per-field confidence scores. 500 free calls/month.

**Website:** https://shopgraph.dev | **API:** https://shopgraph.dev/api/enrich/basic | **MCP:** https://shopgraph.dev/mcp

UCP output validated with [`ucp-schema` v1.1.0](https://lib.rs/crates/ucp-schema) — the official Universal Commerce Protocol schema validator.

## Quick Start

```bash
# Free — no API key, no signup
curl -X POST https://shopgraph.dev/api/enrich/basic \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.allbirds.com/products/mens-tree-runners"}'
```

Returns structured JSON with per-field confidence scores:

```json
{
  "product": {
    "product_name": "Men's Tree Runners",
    "brand": "Allbirds",
    "price": { "amount": 100, "currency": "USD" },
    "availability": "in_stock",
    "categories": ["Shoes", "Running"],
    "confidence": { "overall": 0.95 },
    "_shopgraph": {
      "field_confidence": {
        "product_name": 0.97,
        "brand": 0.95,
        "price": 0.98,
        "availability": 0.90
      }
    }
  },
  "free_tier": { "used": 1, "limit": 500 }
}
```

## Tools / Endpoints

| Tool | REST Endpoint | Price | What It Does |
|------|---------------|-------|-------------|
| `enrich_basic` | `POST /api/enrich/basic` | **Free** (500/month) | Schema.org extraction only. Fast, zero LLM cost. |
| `enrich_product` | `POST /api/enrich` | Subscription or $0.02/call | Full pipeline: Schema.org + Gemini LLM fallback. All fields + images. |
| `enrich_html` | `POST /api/enrich/html` | Subscription or $0.02/call | Bring your own HTML. Works with Bright Data, Firecrawl, any scraper. |

**Pricing:** Free (500/mo) | Starter $99/mo (10K calls) | Growth $299/mo (50K calls) | Enterprise (custom). Pay-per-call via Stripe MPP still available for agents. Cached results (24h) are free. No charge for failed extractions.

## How It Works

```
Your agent sends a URL (or raw HTML)
  → ShopGraph tries Schema.org/JSON-LD parsing first (0.95 confidence, instant)
  → If no structured data: Gemini LLM extracts from page content (0.7+ confidence)
  → If bot-blocked: Playwright browser renders the page first
  → Returns structured ProductData with per-field confidence scores (_shopgraph.field_confidence)
  → Set strict_confidence_threshold to reject low-confidence fields
  → Add format=ucp for Universal Commerce Protocol output
```

**Authentication:** API key (`sg_live_` keys) for subscription tiers, or Stripe MPP for pay-per-call agents.

ShopGraph is a **structuring layer**, not a scraper. It's complementary to Bright Data, Firecrawl, and other scraping APIs. They handle anti-bot. ShopGraph handles product intelligence.

## REST API

### `POST /api/enrich/basic` (Free tier)

```bash
curl -X POST https://shopgraph.dev/api/enrich/basic \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/product"}'
```

Schema.org only. 500 free calls/month per IP. No signup needed.

### `POST /api/enrich` (Full extraction)

```bash
# With API key (subscription)
curl -X POST https://shopgraph.dev/api/enrich \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sg_live_..." \
  -d '{"url": "https://example.com/product", "strict_confidence_threshold": 0.8, "format": "ucp"}'

# With Stripe MPP (pay-per-call)
curl -X POST https://shopgraph.dev/api/enrich \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/product", "payment_method_id": "pm_..."}'
```

Full pipeline with LLM fallback. Authenticate with API key (`sg_live_`) or Stripe MPP.

### `POST /api/enrich/html` (Bring your own HTML)

```bash
curl -X POST https://shopgraph.dev/api/enrich/html \
  -H "Content-Type: application/json" \
  -d '{"html": "<html>...</html>", "url": "https://example.com/product", "payment_method_id": "pm_..."}'
```

Already scraped the page? Pipe the HTML to ShopGraph for structuring.

## MCP Configuration

```json
{
  "mcpServers": {
    "shopgraph": {
      "type": "url",
      "url": "https://shopgraph.dev/mcp"
    }
  }
}
```

Works with Claude, Claude Code, Cursor, Windsurf, CrewAI, LangGraph, AutoGen, and any MCP client.

## Extracted Data

Every response includes:

| Field | Description |
|-------|-------------|
| `product_name` | Product title |
| `brand` | Manufacturer or brand |
| `price` | Amount + currency + sale price |
| `availability` | `in_stock`, `out_of_stock`, `preorder`, `unknown` |
| `categories` | Product taxonomy |
| `image_urls` | Product images (enrich_product/enrich_html only) |
| `color` | Available colors |
| `material` | Materials/fabrics |
| `dimensions` | Size/weight info |
| `confidence` | Overall + per-field scores (0-1) |
| `_shopgraph.field_confidence` | Per-field confidence with field-type modifiers |

## Self-Hosted Setup

```bash
git clone https://github.com/laundromatic/shopgraph.git
cd shopgraph
npm install
```

Required `.env`:

| Variable | Purpose |
|----------|---------|
| `STRIPE_TEST_SECRET_KEY` | Stripe secret key (test or live) |
| `GOOGLE_API_KEY` | Gemini API key for LLM fallback |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis for stats/monitoring (optional) |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis token (optional) |

```bash
npm run build          # Compile TypeScript
npm start              # Run MCP server (stdio)
npm run start:http     # Run HTTP server
npm run dev            # Dev mode (no build needed)
npm run test:run       # Run 118 tests
```

## Monitoring

ShopGraph runs 118 automated tests across 22 product verticals. Self-healing pipeline with circuit breaker, URL verification, and health alerts.

- **Health:** https://shopgraph.dev/health
- **Stats:** https://shopgraph.dev/api/stats
- **Dashboard:** Live on shopgraph.dev homepage

## License

Apache 2.0

## Built By

[Krishna Brown](mailto:hi@kb.computer) | Los Angeles, CA
