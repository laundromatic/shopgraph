# ShopGraph — Project Rules

## Active Plan — Restart Discovery (set 2026-05-31)

**Source of truth:** `docs/next-session-handoff.md`

The session of 2026-05-31 closed with Path C cancelled, Path A paused, and a discovery research wave 2 proposed. Path A had Step 1 + Step 4 rubric weakness that was overlooked; ShopGraph still has zero paying users. No PRD is written until research wave 2 informs direction.

**Behavior:** On any session involving ShopGraph evolution or new product discovery, read `docs/next-session-handoff.md` first, then `.claude/SESSION_NOTES.md` for the failure-mode log. Do not anchor to Path A, Path C, or any prior framing. Do not write PRDs until KB approves a direction.

**Superseded:** `docs/path-a-c-plan.md` (kept for history; the "Path A+C" framing is historical).

## ICP — Documented Path A Use Cases

Path A's working framing: **developer is the buyer + integrator; the human reviewer is either the developer themselves or an operator/operator team they route low-confidence extractions to** for review, verification, training, and correction. Pricing: per-seat for the operator/reviewer + subscription for the API (per-operation pricing for the reviewer surface is explicitly banned).

**Source-of-record:** `~/Documents/Claude/Projects/discovery-research/SESSION-TRANSCRIPT-2026-05-19.md:4615-4625, 4798-4812, 4868-4880`; `docs/path-a-c-plan.md:173-179`; `docs/path-a-c-linear-audit-2026-05-19.md:64-76`. Linear ticket descriptions are thin; transcript and docs are canonical.

### 2 jobs-to-be-done, 4 customer archetypes

**JTBD 1 — Data-quality exception queue for vendors with structured-data products.** Reviewer = vendor's in-house data analyst / data quality team.

- **Wiser Solutions** (B2C price intelligence, "strongest verified fit") — extraction layer for sites where the crawler returns uncertain pricing; low-confidence routes to a Wiser data analyst.
- **Thomasnet** (B2B industrial supplier data normalization) — specs/material/tolerance below-threshold routes to their data team before publishing to the directory.
- **Sovrn Commerce** (B2C affiliate / publisher feed) — fills long-tail + B2B merchants their merchant feeds miss; low-confidence routes to a Sovrn data quality analyst.
- **Skimlinks** (B2C affiliate / publisher feed) — same pattern via "Product Key" enrichment.

**JTBD 2 — Confidence-gated procurement automation.** Reviewer = operator team on the buying side (procurement ops), Slack/email/webhook routing.

- **Mid-market B2B procurement** ($50M-ish manufacturers buying from 150+ niche suppliers without APIs or punchout) — agent extracts, auto-fills verified fields into POs, routes below-threshold fields to `#procurement-ops` for approve/re-extract/reject. **Only archetype without a verified named customer** (transcript:4806 — "hypothesis with no public case studies").

### Implications for the assistant

- **B2B coverage is on-ICP** — justified by Thomasnet (JTBD 1) and mid-market procurement (JTBD 2). Do not strip B2B from corpus, leaderboard, or LAU-308.
- **Long-tail B2C coverage is on-ICP** — justified by Wiser, Sovrn, Skimlinks (all JTBD 1).
- **The four archetypes are the ICP** — not big-box (Amazon, Home Depot, Grainger block serverless), not enterprise procurement via Power Automate, not authenticated extraction proxies (all retired in `path-a-c-linear-audit-2026-05-19.md`).

### Rubric verdict (verified 2026-06-01)

Four rounds of independent sub-agent verification against PROJECT.md (correctly-applied: Step 4 = adjacent-category adoption signal, paid customers NOT required) — Path A passes Steps 1-4 + constraints + goal; Step 5 is **WEAK PASS** (gap is real but K3 differentiation against falsified Box/Extend/Sensible at $499-1499/mo is load-bearing). The general pattern is well-evidenced (60+ repos reinventing it, 30,700+ files, 18+ production vendors); the vehicle (commerce extraction) is a forward bet.

### Three load-bearing risks (carry forward into any Path A build)

1. **Demo positioning** — foreground public-web product pages + three-tier escalation + signed attestations + agent-readiness leaderboard. If demo reads as "Box for web pages," K3 falsification applies retroactively.
2. **Calibration evidence** — Pearson R > 0.70 is precondition for threshold routing being defensible (`path-a-scope-eval-2026-05-31.md:63`). Current state (2026-06-01): 274 samples, overall R -0.106, only price (0.688) positive. Engineering work (matcher asymmetry fix, distribution widening, per-field improvements) closes it. Reaching the bar requires **substantial extraction improvements** — particularly availability (R = -0.01, most volatile field, needs structured-signal parsing tighter freshness coupling) and description. Field-level work is the cleanest next move; ShopGraph IS the forward bet on agentic commerce, and the bet's defensibility depends on calibration being real.
3. **Commerce-as-vehicle is a forward bet** — falsification trigger: Shopify Sidekick + Walmart Sparky lock to first-party data feeds. Monitor Q3-Q4 2026 platform announcements.

### Build scope (chosen 2026-06-01)

Option A from the four documented scope options: agent-ready product feed with verifiable handoff lane + operator review queue (`path-a-scope-eval-2026-05-31.md:38`). Chosen because it's the only option that demonstrates end-to-end using existing substrate. Yes, this is the weakest vehicle by source evidence (commerce purchase agents are "claimed but not adequately verified" per `task-where-collaboration-happens.md:10`) — the trade-off is taken consciously because the pattern is universal and the substrate is built.

### Future vehicles (post-Path A commerce, NOT current roadmap)

Code review and data labeling are STRONGER-evidenced HITL vehicles in the source corpus:
- **Code review:** CodeRabbit ($24/dev/mo), Cursor BugBot ($40/user/mo), Greptile ($30/seat/mo), GitHub Copilot — funded, priced, hired reviewer roles, production-deployed.
- **Data labeling:** Scale AI (~$7B+ valuation), Labelbox, Surge — explicit HITL reviewer workflows, entrenched ML-team relationships.

ShopGraph's substrate (commerce extraction pipeline) does NOT transfer to either vehicle without new infrastructure. **These are documented as FOLLOW-ON vehicles — "will follow" after the commerce vehicle reaches a working state — subject to fresh discovery on whether incumbents leave a defensible angle for a solo founder.** Neither is a current roadmap commitment.

**ShopGraph IS the forward bet on agentic commerce** — that is the operative vehicle commitment. Code-review and data-labeling are optional future explorations, not commitments.

### Context-only

This section anchors the assistant on Path A evolution. Do NOT use it to drive site copy or positioning changes — site copy stays segment-agnostic. Do NOT write PRDs or take build actions without explicit KB approval. **Path A is currently on pause** per `docs/next-session-handoff.md:33-34` (PRD on hold pending research wave 2); use cases + rubric verdict are documented, pause is procedural pending KB direction.

### Verification trail (2026-06-01)

Sub-agent rounds: `a06e9aae7dc847dd7` (initial rubric, pre-correction); `ab5f9d7352f9cf9f6` (standalone-product framing corrected; goal recaptured); `a35eb25bf0d0674e9` (Step 4 interpretation corrected — adjacent-category, not candidate-product); `a2d63899c53e880f9` (final verdict against correctly-applied rubric). PROJECT.md latest at `~/Documents/Claude/Scheduled/PROJECT.md` (with 2026-06-01 application clarification banners).

## Critical Product Rules

### Free Tier Must Work on ICP URLs (LAU-304)
The free tier's only job is to eliminate the buyer's objection "does this work on my URL?" If it fails on the URLs your ICP uses (long-tail B2C retailers — DTC brands, mid-market e-commerce, Shopify stores, and niche retailers without structured merchant feeds), you are failing on qualified leads. A working demo at 25 calls beats a broken demo at 500. Never ship a demo that fails on the first click. The playground is the primary conversion path — if it doesn't work, nothing downstream converts.

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
- LAU-323 / LAU-254 / LAU-255: Atlas PRs (quietloudlab/ai-interaction-atlas) — In Progress. Maintainer Brandon Harwood. PR #1 task_harvest awaiting Netlify→merge, PR #2 human_delegate revisions pushed `51c6d46` (2026-04-28) awaiting re-review, PR #3 task_reconcile parked pending Brandon's decision on top-level task vs workflow template framing. Local repo: `/Users/krishnabrown/sceneinbloom-visual-builder/ai-interaction-atlas`. See `memory/atlas-spinouts-prs.md`.
- Recently Done: LAU-314 (confidence contract rewrite), LAU-315 (/output/ flatten), LAU-318 (FRESHNESS on force-live)

### Phase 4 Positioning (2026-04-16)
See `memory/phase-4-positioning.md` for locked branding. 1-liner is "The extraction API that shows its work." Supersedes Phase 3 "authenticated product data extraction." Banned term additions: "Transparent uncertainty" → "Extraction provenance"; "identity stacks" → "extraction infrastructure"; "routing around Cloudflare blocks" → "escalating through tiers". Naming decision: keep `enrich_*` everywhere in code/API/MCP/SDK; playground button stays "Extract". Autonomy via `strict_confidence_threshold` parameter on the single `enrich_product` tool — no advertising `enrich_product_for_autofill` until it ships.

## n8n Safety Rules
See ~/.claude/CLAUDE.md for n8n execution budget rules and workflow safety protocol.
