# CoWork Briefing — Krishna Brown / Laundromatic

> **Purpose**: This file gives any fresh Claude instance (CoWork scheduled tasks, new sessions, new machines) the full context needed to work autonomously on Krishna's projects. Read this FIRST before doing any work.
>
> **Last updated**: 2026-03-31
> **Canonical location**: shopgraph.dev/briefing

---

## Who Is Krishna Brown?

Krishna Brown is a **systems designer who architects the substrate between humans and AI agents.** Not a pixel designer — she designs governance systems, trust frameworks, agent orchestration, and the rules of engagement between humans and AI.

- **Business entity**: Krishna Brown, LLC
- **Email**: hi@kb.computer
- **GitHub org**: github.com/laundromatic
- **Domains**: sceneinbloom.com, shopgraph.dev, kb.computer, veryboringui.com
- **Plan**: Claude Max (Pro features + Computer Use + full scheduling)
- **LinkedIn**: Active (feature writeups in progress)
- **Social media**: Minimal presence. Creating accounts for Discord, X. Prefers contribution-based visibility over self-promotion.

### Working Style
- **Evidence over claims**: Never say "done" without proof. Test output, screenshots, or API responses required.
- **Proactive execution**: DO the work, don't suggest it. Deploy, test, check logs — don't say "you should."
- **Comprehensive bug sweeps**: When fixing a bug, sweep the entire surface for the same class of bug. Don't fix one at a time.
- **Destructive data safety**: ALWAYS backup → dry-run → approve → verify before any data deletion or overwrite.
- **No template phrases in AI prompts**: Describe voice qualities, don't use cliches.
- **Always check marketplace before publishing**: Search for competitors BEFORE building any tool/package/MCP.

### Current Situation (March 2026)
- Starting a **short-term contract job** that consumes weekdays. Limited availability.
- Needs Claude/CoWork to work **autonomously** during the day. Krishna reviews evenings/weekends.
- Actively seeking full-time employment. **Portfolio matters more than revenue right now.** Showing what she's built > trying to fit a job title.
- The design field is being disrupted. No standard title exists for the work Krishna does. The work itself IS the resume.

---

## What Is SceneInBloom?

**SceneInBloom** (sceneinbloom.com) is a **hybrid agentic commerce and content platform** that transforms cinematic moments into shoppable lifestyle content.

- **How it works**: Each campaign pairs a movie/show with a flower. AI agents generate Pinterest pins with titles, descriptions, and product recommendations. Human reviews and approves. Published to Pinterest.
- **Identity**: "The friend who pauses the movie to say 'look at that lamp.'" Obsesses over cinematic details — flowers, colors, costumes, settings — and finds real products inspired by them.
- **Architecture**: Next.js 15 + Tailwind + shadcn/ui on Vercel. Google Sheets as data layer. n8n workflows for automation. Google OAuth with email allowlist. Gemini for AI vision. Templated.io for renders. Pinterest API for publishing.
- **Trust framework**: Supervised → Autonomous (graduates at 95% accuracy over 50 instances) → Permanent Gate (never graduates). Human directs, system executes.

### Milestone Status
| Milestone | Status | Key Deliverables |
|-----------|--------|------------------|
| **M0** | Complete | API applications (YouTube, TikTok) |
| **M1** | Complete | CRI (review interface), Pinterest API, Testing, Voice Evolution |
| **M2** | **In Progress** | /shop page, Product Intelligence Agent, Trudy Rewrite |
| **M3** | Not Started | Video pipeline, FFmpeg, Eleven Labs |
| **M4** | Not Started | TikTok, YouTube, Instagram, Threads APIs |
| **M5** | Not Started | Quality, Performance, Ideation agents |
| **M6** | Not Started | Trust Graduation, Conductor Agent |

### Key Systems Built
- **CRI** (Comprehensive Review Interface): Campaign overview → pin detail editor
- **/shop pages**: Public product grid (ISR), email capture, prev/next navigation
- **Shop admin** (`/dashboard/shop`): DnD reorder, product editing, grid order management
- **Voice system**: Pattern Harvester + Voice System Updater + Style_Guide prompt architecture with {{placeholder}} injection
- **5-layer testing**: Vitest + Playwright + TDD Guard + pre-commit hooks + QA sub-agent
- **Product Intelligence Agent**: Product matching, catalog curation, Sovrn affiliate integration
- **Pinterest API**: Direct publishing (boards + pins), auto-refreshing OAuth tokens

### Linear Tracking
- **Initiative**: SceneInBloom 2026
- **Projects**: sceneinbloom (main), veryboringui (UI library), SpinOuts (standalone products)
- Issue prefix: LAU-

---

## What Is ShopGraph?

**ShopGraph** (shopgraph.dev) is a **product data quality/structuring layer for agent commerce.** It turns messy HTML from any product page into clean, validated, confidence-scored product data. Complementary to scraping APIs (Bright Data, Firecrawl) — they handle the hard scraping, ShopGraph handles product intelligence.

- **Live**: shopgraph.dev/mcp
- **GitHub**: github.com/laundromatic/shopgraph
- **Launched**: 2026-03-24
- **Users**: 0 (pre-traction)
- **Revenue**: $0

### Key Stats
- 2,308+ pages tested, 97% success rate, 22 product verticals
- 111 automated tests
- Self-healing pipeline: circuit breaker, health check, auto-quarantine
- Browser fallback via @sparticuz/chromium on Vercel
- Two extraction paths: Schema.org/JSON-LD (fast, free) + Gemini LLM fallback

### Evolution Strategy (decided 2026-03-31)
ShopGraph is NOT competing with Bright Data/Oxylabs on scraping. It's the structuring layer on top.

**Architecture pattern (decided 2026-03-31):**
API first, MCP as wrapper, playground as conversion. This applies to ALL Laundromatic products.
```
shopgraph.dev/api/enrich          ← REST (curl, fetch, any language)
shopgraph.dev/api/enrich/html     ← REST (agent provides raw HTML)
shopgraph.dev/api/enrich/basic    ← REST (free tier, schema.org only)
shopgraph.dev/mcp                 ← MCP (wraps the same engine)
shopgraph.dev                     ← Landing page with API playground
```
The playground is the conversion tool. Paste a URL, see structured data in 2 seconds. No signup, no MCP config, no Stripe. 200 free calls. MCP-only distribution got zero usage — the REST API + playground is the fix.

**Why LAU-266 (REST API) is now critical path**: Everything else depends on it. The playground can't work without REST endpoints. MCP directories alone produced zero usage. REST makes ShopGraph accessible to any language, any framework, any developer who can curl.

**Build sequence** (LAU-262 epic, re-prioritized):
1. REST API + playground (LAU-266) — **CRITICAL PATH, do first**
2. `enrich_html` tool — agent provides raw HTML, ShopGraph structures it (LAU-263)
3. Wire PIA to consume ShopGraph — dogfooding, first real customer (LAU-264)
4. Free tier — 200 calls/month (LAU-265)
5. `validate_feed` — Lighthouse for agent commerce, merchant-side play (LAU-267)
6. `generate_ucp_manifest` + `validate_ucp_manifest` — UCP manifest generation from extracted product data (portfolio play, demonstrates protocol fluency)

**UCP manifest tools context**: UCP (Universal Commerce Protocol, Shopify + Google, 20+ retailers) is live but early. Spec is stable at core (v2026-01-23), with capability extensions expanding monthly (Cart, Catalog, Identity Linking added March 2026). ShopGraph is uniquely positioned: it already extracts product data, adding manifest generation creates an end-to-end pipeline (URL → structured data → deployable UCP manifest). The employer/portfolio story is strong even if merchant adoption is slow: demonstrates systems thinking, protocol fluency, and future-positioning.

### Competitive Landscape (researched 2026-03-31)
- **Bright Data MCP**: 5K free/month, raw scraping. ShopGraph is complementary, not competing.
- **Diffbot**: $299/mo, ML extraction from any URL. Established since 2012.
- **Rye**: $0.02/fetch + checkout bundled. Developer-first product data API.
- **Canopy**: Amazon-only, $0.01/req, has MCP.
- **ReFiBuy**: Merchant-side catalog optimization for agent discovery. Q3 2026 launch.
- **ACP/UCP**: Protocols moving toward merchants publishing structured feeds.

ShopGraph's differentiation: MCP-native, Stripe MPP, open source, quality scoring (not just raw extraction), and the `enrich_html` path that makes it a structuring layer others pipe data through.
- Daily cron: every 30 min → auto-switches to every 2h at 5,000 pages

### Competitive Position (Verified 2026-03-24)
Checked all 47 e-commerce MCP servers on Glama. Every one is a platform-specific API wrapper (Shopify, WooCommerce, etc.). **None extract structured data from arbitrary URLs.** ShopGraph is unique.

### Stripe MPP
- Krishna Brown, LLC account. MPP access APPROVED.
- Stripe's Ben Berke wanted to schedule a call — **never replied to scheduling. Don't mention publicly.**
- Pricing: enrich_product $0.02, enrich_basic $0.005, enrich_batch $0.15

### Directories
Glama, Smithery, mcpservers.org, MCP Market, Official MCP Registry. 2 awesome-list PRs pending.

---

## The Thesis

**"Tools that help humans and agents work together safely and effectively."**

This covers everything Krishna builds:
- **ShopGraph**: How agents access real-world commerce data
- **SceneInBloom**: How humans and AI agents collaborate on content creation with earned trust
- **Future spinouts**: Voice evolution, agent QA, graduated autonomy — all from this thesis

---

## Spinout Pipeline & Evaluation

### Idea Evaluation Criteria (Ranked)
1. **Uniqueness + Pain/Friction** — Does this solve a real pain? Does anything else solve it?
2. **Portfolio Signal** — Demonstrates substrate design, agent orchestration, system thinking?
3. **Autonomous Buildability / Time to Deploy** — Can Claude build 80%+ without Krishna? Days, not weeks?
4. **Visibility & Adoption** — Where do users find this? Is the audience actively looking?
5. **Defensibility Against DIY** — Why use this instead of building it yourself with AI?
6. **Revenue Potential** — Can this eventually charge? (Lower priority — adoption first)
7. **Compounds with Existing** — SceneInBloom spinout? Reuses infra?

### SpinOut Criteria (All 5 Must Be Met)
1. **Unique** — no incumbents with significant adoption
2. **Valuable** — solves a real pain point people actively have
3. **Fills a gap** — names something missing
4. **Built** — code, not docs. Deployable, operationalizable, scalable
5. **Demonstrates building AI** — not just building with AI

### Killed Ideas (Don't Revisit)
| Idea | Why Killed |
|------|-----------|
| agent-guardrails skills pack | Incumbents (obra/superpowers 21K installs) |
| n8n workflow templates | Saturated (8,500+ free) |
| Pinterest Publishing MCP | 10+ existing solutions including free open-source |
| TrustGate (graduated autonomy lib) | Too easy to DIY. Concept simple, low defensibility |
| Static playbook ($29 PDF) | Fails "built" and "building AI" criteria |
| Atlas MCP Server | Unique but audience too small |

### Active / Viable Ideas (As of 2026-03-31)
| Idea | Status | Score |
|------|--------|-------|
| **ShopGraph** | LIVE — evolving from scraper to structuring layer + UCP manifest tools | Highest viability (quality moat) |
| **VoiceForge** (voice evolution pipeline) | Validated — competitive gap confirmed | **53/70** (highest spinoff score) |
| **TrustKit** (trust graduation SDK) | Back pocket — viable but weaker defensibility | 50/70 |

**VoiceForge validation (2026-03-31):** Web search confirmed the closed-loop evolution gap. Writer.com and Jasper have voice profiles but "no true human-in-the-loop learning — edits don't train the system, each generation starts fresh." Houtini Voice Analyser MCP does one-shot extraction (14 statistical engines) but no evolution. Typeface trains on brand content but doesn't learn from post-generation edits. Nobody ships the closed loop: harvest → store → inject → capture human edits → evolve. SIB's voice system (Pattern Harvester + Style_Guide prompts + placeholder injection) is the architecture to extract. Distribution: API first, MCP as wrapper, playground as conversion (same pattern as ShopGraph). Risk: Typeface ($165M raised) or Writer ($200M+) could build the evolution loop, but VoiceForge would be infrastructure (API + MCP) complementary to those platforms, not competing.

**TrustKit context:** Framework-agnostic trust graduation SDK. Every agent framework (LangGraph, CrewAI, AutoGen) builds HITL from scratch with static gates. Nobody ships a standalone, drop-in middleware that tracks accuracy over time and auto-graduates autonomy levels. SIB M6 trust design is the architecture. Weaker defensibility score (5/10) — individual gates are easy to DIY, but the learning/graduation logic is harder. Keep in back pocket.

### Killed Ideas (with evidence — DO NOT REVISIT)
| Idea | Why Killed | Date |
|------|-----------|------|
| agent-guardrails skills pack | Incumbents (obra/superpowers 21K installs) | 2026-03-19 |
| n8n workflow templates | Saturated (8,500+ free) | 2026-03-19 |
| Pinterest Publishing MCP | 10+ existing solutions | 2026-03-31 |
| TrustGate (graduated autonomy lib) | Too easy to DIY, low defensibility | 2026-03-31 |
| Agent Manifest (orchestration format) | Standards war: Oracle Agent Spec, CrewAI YAML, Google ADK, A2A | 2026-03-31 |
| Agent QA Harness | Saturated: 6+ MCP testing frameworks, MCPBench, MCP Scorecard | 2026-03-31 |
| Static playbook ($29 PDF) | Fails "built" and "building AI" criteria | 2026-03-19 |
| Google Sheets Backend MCP | Multiple exist | 2026-03-19 |
| Atlas MCP Server | Unique but audience too small | 2026-03-19 |
| ShopGraph developer pivot | Market already served: Bright Data 5K free, Diffbot 10K free | 2026-03-31 |
| ToolMint (MCP monetization framework) | Stripe ships @stripe/mcp, @stripe/agent-toolkit, @stripe/ai-sdk. Plus Agent Bazaar, Apify, MCP-Hive, Moesif, MonetizedMCP.org | 2026-03-31 |
| AgentDesk (agent oversight dashboard) | Folds into SIB M6, not a standalone spinoff | 2026-03-31 |
| MCP Config Sync | mcp-linker (GitHub) already exists | 2026-03-31 |
| AgentReady (ACP/UCP validator) | UCPtools.dev, Nextwaves, Apify UCP Validator already exist | 2026-03-31 |
| Agent cost monitoring | Portkey, Helicone, Langfuse, Tokencast, Datadog LLM Observability | 2026-03-31 |

### Distribution — Not Just npm
Build for whatever format reaches the audience:
MCP servers, npm packages, Vercel integrations, Vercel templates, Chrome extensions, Raycast extensions, GitHub Actions, Claude Code skills, VS Code extensions, Cloudflare Workers, APIs/microservices, future Siri Extensions.

**Key lesson (2026-03-31):** ShopGraph listed on Glama, Smithery, mcpservers.org, MCP Market, and Official MCP Registry with **zero usage.** MCP directory listings are table stakes, not a growth channel. The fix: REST API + landing page playground as the primary conversion tool. MCP server wraps the same engine for agents. This pattern applies to all Laundromatic products (ShopGraph, VoiceForge, any future spinout).

---

## CoWork's Role

### What CoWork Does
- **Scout**: Weekly scan of emails, HN, npm trending, MCP registries, GitHub trending, social media for opportunities
- **Monitor**: Weekly health checks on ShopGraph, GitHub metrics, npm downloads, competitive landscape
- **Evaluate**: Score new ideas against criteria, generate reports for Krishna to review
- **Draft**: Social media reply drafts, outreach templates, competitive analysis

### What CoWork Does NOT Do
- **Build**: Claude Code CLI handles all coding, testing, deploying, git
- **Go/No-Go decisions**: Krishna decides. CoWork recommends.
- **Post on social media**: Krishna reviews and posts. CoWork drafts.
- **Spend money**: No purchases, no API calls that cost money, no triggering paid workflows

### Market Analysis Checklist (For Every New Idea)
Before recommending any idea, search ALL of these:
- npm registry (exact + fuzzy keyword)
- MCP registries (Glama, Smithery, mcp.so, MCP Market, Official)
- Vercel Marketplace, GitHub Marketplace, Chrome Web Store, Raycast Store, VS Code Marketplace
- GitHub (repos, code search, trending)
- X/Twitter, Discord, Reddit (r/ClaudeAI, r/LocalLLaMA, r/SideProject)
- Hacker News (Show HN), Product Hunt, Dev.to, IndieHackers
- Enterprise vendors in the space
- DIY assessment: Can someone build 80% of this in a day with AI?

---

## Pending External Items
| Item | Status | Date |
|------|--------|------|
| Google OAuth Verification | In review | Submitted 2026-03-11, expect 4-6 weeks |
| Sovrn Publisher (sceneinbloom.com/shop) | Reapplied | 2026-03-17, expect ~5 business days |
| Amazon Associates | TERMINATED | Not enough traffic. Pivoting to Sovrn |
| Stripe MPP | APPROVED | Jennifer Lee asked to chat, KB replied with availability, Jen never scheduled. Thread warm. Re-engage after REST API ships. |
| Atlas PRs (human_delegate, task_reconcile) | Submitted | Awaiting Brandon's review |

---

## Affiliate Strategy
- Amazon Associates: **TERMINATED** (not enough traffic)
- Sovrn Commerce: **PENDING APPROVAL** for sceneinbloom.com/shop
- All affiliate links will consolidate through Sovrn (including Amazon merchant links)
- VigLink script on sceneinbloom.com
- Need SEO/traffic strategy — 0 followers, no budget

---

## Key Contacts
- **Brandon (QuietLoudLabs/AI-Atlas)**: Reviewing Atlas pattern PRs. Collaborative, detailed reviewer. 3 acceptance criteria: dimensional uniqueness, distinct failure mode, design conversation utility.
- **Jennifer Lee (Stripe, jenlee@stripe.com)**: Replied "This is super cool!" to ShopGraph demo email (Mar 25). Asked to chat 15 min. KB responded with availability. Jen never followed up to schedule. Ben Berke (benberke@stripe.com, Crypto team, Chicago) granted MPP access (Mar 23). Thread is warm — KB is not the one who dropped the ball. Re-engage when REST API + enrich_html ship.

---

## How To Update This File
When significant decisions, pivots, or status changes happen:
1. Update the relevant section in this file
2. Edit `public/briefing.md` in the shopgraph repo (github.com/laundromatic/shopgraph) OR update via the shopgraph.dev Vercel deployment
3. CoWork's next scheduled task will pick up the changes automatically from shopgraph.dev/briefing

This file should be the SINGLE SOURCE OF TRUTH for any Claude instance working on Krishna's projects.
