# ShopGraph — Project Rules

## Critical Product Rules

### Free Tier Must Work on ICP URLs (LAU-304)
The free tier's only job is to eliminate the buyer's objection "does this work on my URL?" If it fails on the URLs your ICP uses (B2B suppliers, large retailers), you are failing on qualified leads. A working demo at 25 calls beats a broken demo at 500. Never ship a demo that fails on the first click. The playground is the primary conversion path — if it doesn't work, nothing downstream converts.

Current state: Playground now uses `/api/playground` (full pipeline, 100/day IP throttle for testing). Free tier changed from 500 Schema.org-only to 50 full-pipeline calls/month.

### Extraction — Verified Working Sites
30 sites verified live on leaderboard (18 B2B + 12 B2C) across 17 verticals. Playground auto-ingests new domains to leaderboard via `src/leaderboard.ts`.

Sites like Grainger, Home Depot, Amazon, McMaster-Carr block serverless IPs. These have been REMOVED from the leaderboard. Do NOT add sites to the leaderboard unless extraction is verified via /api/playground. Do NOT claim RFC 9421 or Cloudflare registration will fix blocked sites — we have no evidence.

LAU-296: RFC 9421 identity (includes Cloudflare Signed Agents registration, formerly LAU-307)
LAU-308: B2B vertical coverage — 30 sites verified so far

### Banned Terms
Never use in any customer-facing copy: deterministic, guaranteed, scraping/scraper, bypass/circumvent, unblock, fighting, toll roads (commerce context), identity broker, OV identity, trust score, "the first" (unqualified)

### Banned Patterns
No "Stop doing X." No "Don't let Y happen." No fear-based framing. No negative assumptions about the developer's current state. No em dashes in blog posts. No "SceneInBloom." No "Built with Claude Code" footers.

### Scoring Schema Source of Truth
The source of truth for AgentReady scoring is `src/agent-ready.ts`. Dimension API names: structured_data_completeness, semantic_richness, ucp_compatibility, pricing_clarity, inventory_signal_quality, access_readiness. Weights: 0.30, 0.20, 0.20, 0.15, 0.15, 0.00. Score scale: 0-100. Per-field confidence: separate 0-1 scale. scoring_version: "2026-04-08-v1". All documentation pages must match these values.

## Design Rules

### Agentation is the Design Reference
shopgraph.dev matches agentation.com's design system: Inter font, rgba black palette, 0.8125rem headings with ::after flex line, flush-left nav with subnav TOC.

### Design QA Process
Never claim "matches Agentation" without side-by-side Playwright screenshots comparing specific properties (font size, weight, color, spacing, borders, indicators). Structure match is not style match. Use the `/design-qa` skill.

### Screenshots
Save Playwright screenshots to `.screenshots/` directory, not Downloads. Use `downloadsDir` parameter.

### Figma
Use Figma MCP to get exact styles, colors, and spacing when the user references Figma designs. The sidebar nav styles come from Figma (Phosphate logo, 13px nav items, #007AFF active state, #222 text).

## Architecture

### Branch Strategy
Work directly on `main`. The `feat/site-redesign` branch served its purpose and is merged. Production deploys from `main` to shopgraph.dev via Vercel.

### Site Structure
Vanilla HTML/CSS/JS site. No React, no Tailwind, no build step. Static files in `public/`. Styles in `public/styles/main.css`. Shared components in `public/components/` (nav.js, playground.js, code-highlight.js, diagram-animations.js).

### Diagram Animation System
Global system at `styles/diagram-animations.css` + `components/diagram-animations.js`. Use `dg-*` classes on diagram elements. Include both files on pages with diagrams. Animations should cycle continuously (infinite), not one-shot. Elements should animate in sequence, not simultaneously (LAU-303).

### Node Packages
- `packages/n8n-nodes-shopgraph/` — published to npm as n8n-nodes-shopgraph@1.0.0
- `packages/make-shopgraph/` — Make.com custom app, created in developer portal, needs scenario testing

## Linear

- Project: SpinOuts (ID: 52fb78a7-28c7-4d93-9973-00477f8d1337)
- Team: Laundromat (ID: 79695da0-4210-4342-8352-cab04a309699)
- User ID: ae15cb41-10cc-419d-88ff-2bd4461721ba (Krishna Brown)

### MANDATORY: Update Linear When Work Ships

When you complete work on any LAU-XXX ticket (committing code, verifying a feature, deploying, closing out a task), you MUST update the Linear issue status in the same session using `mcp__linear__linear_updateIssue`. Do not wait for a cleanup pass. Do not leave shipped work in Backlog.

Workflow state IDs (Laundromat team):
- Backlog: dd45831c-dfc0-4bc5-9a9f-ae31bb250fec
- Todo: 22c8d051-d155-427d-839d-0033f1c2c5b9
- In Progress: b4266fdf-c17e-46e5-a233-ef095a76a523
- Done: 2aaf2482-939d-4c11-af01-492ce2713c93
- Canceled: 12ff32ea-23bb-461a-8347-ca457dbd7d2f

When starting work on a ticket: move to In Progress.
When work is verified complete: move to Done.
When a ticket is superseded: move to Canceled with a comment explaining what replaced it.

### Active Tickets
- LAU-280: Framework PRs — In Progress, Vercel AI SDK + LangChain PRs submitted + Phase 4 aligned 2026-04-16
- LAU-285: Make.com app — Done (2026-04-26), all modules verified, 6 bugs fixed
- LAU-287: Confidence scoring — In Progress, Phase 1 shipped, calibration needs ENABLE_LLM_VALIDATION
- LAU-296: RFC 9421 identity — In Progress, infra shipped, registry registration pending (includes old LAU-307)
- LAU-275: AgentReady scoring — In Progress, scoring API shipped, leaderboard/correlation pending
- LAU-308: B2B vertical coverage — In Progress, 30 sites verified
- LAU-309: Leaderboard v2 — In Progress, Phases 1-3 shipped, Phase 4 (metrics) pending
- LAU-259: MCP directory registration — In Progress, P3. mcp-marketplace.io submitted via creator flow 2026-04-21 (pending review). LAUNCHGUIDE.md at repo root is the marketplace source-of-truth. Official MCP Registry confirmed published. CVE patches shipped (vitest 4 + mcp-sdk 1.29). Remaining: smithery.yaml stale copy + cross-directory copy audit.
- LAU-310: Page purpose overlap (self-healing / routing / playground) — Todo
- LAU-316: No self-serve upgrade path free → paid — Todo, High (2026-04-16, signup frontend + email stubbed)
- LAU-324: Codify development hygiene as automated guardrails — In Progress, High. Parent-level initiative from 2026-04-21 /insights review. Scoped, bounded hooks + skills + sub-agents, rolled out in paced checkpoints. See `memory/feedback-automation-hygiene.md` for the Jan 30 constraints.
- Recently Done: LAU-314 (confidence contract rewrite), LAU-315 (/output/ flatten), LAU-318 (FRESHNESS on force-live)

### Phase 4 Positioning (2026-04-16)
See `memory/phase-4-positioning.md` for locked branding. 1-liner is "The extraction API that shows its work." Supersedes Phase 3 "authenticated product data extraction." Banned term additions: "Transparent uncertainty" → "Extraction provenance"; "identity stacks" → "extraction infrastructure"; "routing around Cloudflare blocks" → "escalating through tiers". Naming decision: keep `enrich_*` everywhere in code/API/MCP/SDK; playground button stays "Extract". Autonomy via `strict_confidence_threshold` parameter on the single `enrich_product` tool — no advertising `enrich_product_for_autofill` until it ships.

## n8n Safety Rules
See ~/.claude/CLAUDE.md for n8n execution budget rules and workflow safety protocol.
