# Prompt for Claude Web: ShopGraph LinkedIn Feature Writeup

## Instructions

Write a LinkedIn Feature writeup for ShopGraph (shopgraph.dev). This will appear in the Featured section of my LinkedIn profile, not as a post. It should link to shopgraph.dev. The tone should be professional, builder-focused, and grounded in real work, not marketing fluff. Write from the first person perspective of the builder (Krishna Brown).

The writeup should cover: what ShopGraph is, why it exists, the agentic commerce landscape it operates in, and why it matters for agents and the businesses behind them. It should read as "here's what I built and why" not "buy my product."

Length: 3-5 paragraphs. Concise. No emojis. No buzzword soup.

---

## Full Context for the Writeup

### What ShopGraph Is

ShopGraph is a Model Context Protocol (MCP) server that extracts structured product data from any product page on the open web. AI agents connect via MCP, send a product URL, and get back structured JSON: product name, brand, price, availability, categories, images, colors, materials, dimensions, and confidence scores per field.

Two extraction paths:
- Schema.org / JSON-LD parsing (fast, high confidence 0.95, no AI cost)
- Gemini LLM fallback when no structured markup exists (0.7+ confidence)
- Playwright browser fallback for JS-rendered and bot-blocked pages

Agents pay per call via Stripe's Machine Payments Protocol (MPP), launched March 18, 2026. ShopGraph was one of the first MCP servers built on Stripe MPP.

**Live at:** shopgraph.dev
**MCP endpoint:** shopgraph.dev/mcp
**GitHub:** github.com/laundromatic/shopgraph
**Pricing:** $0.01-$0.02 per call. Cached results are free.

### Why It Exists

Agentic commerce is growing rapidly. Google's Universal Commerce Protocol (UCP), Shopify's Agentic Storefronts, and Stripe's Machine Payments Protocol are building the infrastructure for AI agents to shop, compare, and purchase on behalf of businesses and consumers.

But these platforms only cover their own merchants:
- Shopify Catalog covers Shopify merchants
- Google UCP covers Google Shopping merchants
- Amazon covers Amazon sellers

By merchant count, millions of retailers are NOT on these platforms: DTC brands, independent shops, niche suppliers, B2B distributors, specialty retailers. These merchants have product pages but no structured API or data feed. When an agent needs to compare prices across 50 retailers and 15 of them are independent sites with no API, the agent is blind to those 15.

ShopGraph fills that gap. It gives agents structured product data from the open web, where platform APIs don't reach.

### The Agentic Commerce Landscape (March 2026)

Key developments that informed ShopGraph:

**Google UCP updates (March 2026):**
- Agents can now add multiple items to cart, retrieve real-time product details (variants, inventory, pricing), and use Identity Linking for loyalty/member benefits
- Google's AI Strategy lead Heiko Hotz called it "bright future for agentic commerce"

**Stripe Machine Payments Protocol (launched March 18, 2026):**
- Open standard for AI agents to make and receive payments
- Built on Tempo blockchain (Stripe + Paradigm), supports USDC + fiat via Shared Payment Tokens
- 100+ launch partners including Anthropic, OpenAI, Shopify
- Visa contributed to the protocol specifications

**Shopify Agentic Storefronts:**
- Merchants toggle on, products instantly discoverable by ChatGPT, Perplexity, Copilot
- Shopify Catalog API lets agents search billions of products

**OpenAI commerce pivot:**
- Built Instant Checkout in ChatGPT with Walmart, Target, Shopify, Etsy, PayPal
- Then killed it (March 2026), pivoting to brand-owned ChatGPT Apps
- Amazon invested $50B in OpenAI

**Industry commentary (from LinkedIn discussions on the UCP announcement):**
- Eric Marcano (Commercial Leader): "The friction is in the legal and financial settlement logic between disconnected ERP systems. No mechanism for multi-layer approval workflows required in enterprise-scale procurement."
- Praveen Gaur (Agentic Commerce Architect): "Merchants aren't resistant. They're overwhelmed by conflicting signals."
- Tiago Fernandes (AI Visibility): "The first step for e-commerce players is to be visible in AI Search. Only then the agents can do their job."
- Amr Hamad (Retail Media Director): "B2B procurement demands clear accountability chains that current AI frameworks simply don't address."

### Who Uses ShopGraph (The Real Customer)

Behind every agent is a business. The businesses that need structured product data from the open web:

- **Price comparison platforms** — agents monitoring prices across hundreds of retailers, many without APIs
- **Competitive intelligence firms** — reading competitor product pages without API access or partnership
- **Market research agencies** — surveying product categories across hundreds of brands
- **Affiliate marketing networks** (like Sovrn, Skimlinks) — publishers' agents need prices and images from every merchant they link to, including the ones without structured feeds
- **B2B procurement teams** — sourcing from niche industrial suppliers, farm equipment distributors, specialty wholesalers that have product pages but no API
- **Second-hand / circular economy** — tracking resale prices across ThredUp, Poshmark, BackMarket, independent consignment shops

### What Makes It Unique

Verified against all 47 e-commerce MCP servers on Glama (the largest MCP directory). Every single one is a platform-specific API wrapper (Shopify, WooCommerce, Square, etc.) or marketplace connector. None extract structured data from arbitrary URLs. ShopGraph is the only MCP server that works without merchant cooperation. It reads the public product page.

### Technical Details

- 111 automated tests
- 117 verified URLs across 22 B2C and B2B shopping verticals in the daily test corpus
- Self-healing pipeline: circuit breaker auto-quarantines failing URLs, health check endpoint, proactive alerts
- Daily automated testing via Vercel Cron (every 30 minutes, 12 URLs per batch)
- Live quality dashboard on shopgraph.dev showing real-time extraction stats by vertical
- Deployed on Vercel with Upstash Redis KV for stats persistence
- Apache 2.0 licensed

### Directory Listings

- Glama (approved, AAA scores)
- Smithery (published)
- mcpservers.org (approved)
- MCP Market (listed)
- Official MCP Registry (published via mcp-publisher)
- Two awesome-mcp-servers GitHub PRs pending

### Connection to SceneInBloom (Origin Story, Use Lightly)

ShopGraph was extracted from SceneInBloom, an AI-native commerce platform I built and operated over 70+ development sessions. SceneInBloom's Product Intelligence Agent needed structured product data to match products to content. The enrichment pipeline I built for SIB became the foundation for ShopGraph. The extraction engine, the product data schema (19 fields with confidence scores), and the operational patterns (trust graduation, self-healing monitoring) all came from real production experience, not theory.

However: the LinkedIn writeup should focus on ShopGraph itself and the agentic commerce opportunity, not on SceneInBloom. Mention the origin briefly if it adds credibility ("built from real production experience") but don't make SIB the focus.

### Strategic Positioning

"Structured product data from the millions of retailers that aren't on Shopify, Google, or Amazon. The DTC brands, independent shops, and niche suppliers that platform catalogs miss."

ShopGraph is not competing with Shopify Catalog or Google UCP. It fills the gap they leave behind. It covers the open web where structured data doesn't exist yet.

The bet: agentic commerce expands beyond single-platform agents. Agents will increasingly need to compare, research, and discover across the full open web, not just within one platform's walled garden.

### What NOT to Include

- Don't mention the Atlas contributions (human_delegate, task_reconcile, task_harvest) — that's separate work
- Don't mention the agent-guardrails skills pack (archived)
- Don't mention specific pricing numbers for Stripe MPP competitors
- Don't mention the 47% success rate incident (that was a corpus quality issue, since fixed)
- Don't mention SceneInBloom's specific features (campaigns, Pinterest, Trudy, etc.)
- Don't use the word "revolutionary" or "game-changing"
- No emojis

### Tone

Builder, not marketer. "Here's what I built, here's why, here's the landscape it operates in." The reader should come away thinking "this person understands agentic commerce deeply and built something real" not "this person is selling me something."
