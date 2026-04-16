# ShopGraph

The extraction API that shows its work. Send a URL or raw HTML, get structured JSON with per-field confidence scoring and extraction provenance — every field shows which method produced it (Schema.org, LLM inference, or headless browser) and how confident the system is. Set `strict_confidence_threshold` and uncertain fields are removed server-side before they reach your agent. 50 free calls/month.

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
  "free_tier": { "used": 1, "limit": 50 }
}
```

## Tools / Endpoints

| Tool | REST Endpoint | Price | What It Does |
|------|---------------|-------|-------------|
| `enrich_basic` | `POST /api/enrich/basic` | Free (shared quota) | Schema.org extraction only. Fast, zero LLM cost. |
| `enrich_product` | `POST /api/enrich` | Free 50/mo, then subscription or $0.02/call | Full pipeline with per-field confidence scoring and extraction provenance. |
| `enrich_html` | `POST /api/enrich/html` | Subscription or $0.02/call | Bring your own HTML. Works with Bright Data, Firecrawl, or any fetch/proxy tool. |

**Pricing:** Free (50/mo) | Starter $99/mo (10K calls) | Growth $299/mo (50K calls) | Enterprise (custom). Pay-per-call via Stripe MPP still available for agents. Cached results (24h) are free. No charge for failed extractions.

## How It Works

```
Your agent sends a URL (or raw HTML)
  → Tier 1: Schema.org/JSON-LD parsing (0.93 baseline confidence, instant)
  → Tier 2: LLM extracts from page text when structured data is absent (0.70 baseline)
  → Tier 3: Headless Playwright renders JavaScript, then extracts (additional inference step)
  → Returns ProductData with per-field confidence scores and extraction provenance
    (which tier produced each field) in _shopgraph.field_confidence
  → Set strict_confidence_threshold to remove low-confidence fields server-side
    before they reach your agent
  → Add format=ucp for Universal Commerce Protocol output
```

**Authentication:** API key (`sg_live_` keys) for subscription tiers, or Stripe MPP for pay-per-call agents.

ShopGraph is a **structuring layer**, not a fetcher. It's complementary to Bright Data, Firecrawl, and other fetch/proxy tools. They handle retrieval. ShopGraph handles extraction provenance and per-field confidence scoring.

## REST API

### `POST /api/enrich/basic` (Free tier)

```bash
curl -X POST https://shopgraph.dev/api/enrich/basic \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/product"}'
```

Schema.org only. Shares the free-tier quota with `/api/enrich`. No signup needed.

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

Full pipeline: Schema.org → LLM inference → headless browser. 50 free calls/month. Authenticate with API key (`sg_live_`) or Stripe MPP for higher limits.

### `POST /api/enrich/html` (Bring your own HTML)

```bash
curl -X POST https://shopgraph.dev/api/enrich/html \
  -H "Content-Type: application/json" \
  -d '{"html": "<html>...</html>", "url": "https://example.com/product", "payment_method_id": "pm_..."}'
```

Already fetched the page? Pipe the HTML to ShopGraph for structuring.

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
| `GOOGLE_API_KEY` | Gemini API key for Tier 2 (LLM) inference |
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
