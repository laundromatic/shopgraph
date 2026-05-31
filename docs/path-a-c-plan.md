# Path A + Path C — Active Plan

**Last updated:** 2026-05-19 (end of session)
**Direction set:** 2026-05-19
**Domain focus:** Commerce/shopping first; architecture generalizes

> **For Claude**: When working in this project on Path A or Path C topics, append the **Checklist block** below to every response until all items are done. Update item status in this file as work progresses. The block is what KB sees; the details below are the source of truth.

---

## How to resume (read this first on next session)

**State at session end (2026-05-19):**
- ✅ Linear roadmap audit complete → `docs/path-a-c-linear-audit-2026-05-19.md`
- ⏸ Linear ticket hygiene **on hold** until Path A PRD lands (KB decision: avoid rewriting tickets twice)
- → **Next action:** spawn Path A PRD sub-agent

**PRD workflow (KB decision, 2026-05-19):**
1. Sub-agent drafts PRD to `docs/specs/YYYY-MM-DD-{path}-DRAFT.md`
2. Claude reviews against session context, annotates/edits inline, flags decisions for KB
3. KB reviews, section by section
4. Final PRD written to `docs/specs/YYYY-MM-DD-{path}.md`

**Open decisions to bring to KB at session start:**
- Path C v1 scope: layers 1+2 (foundational), 1+2+3 thin-file scoring (novel), or both presented as options? *(Default if not answered: sub-agent presents both options in the draft.)*
- Path A and Path C sub-agents in parallel, or A first then C? *(Default: A first, since Path A is closer to existing infra and informs Path C reference implementation positioning.)*

**Key files for new session context:**
- This plan: `docs/path-a-c-plan.md`
- Linear audit: `docs/path-a-c-linear-audit-2026-05-19.md`
- Full session transcript: `~/Documents/Claude/Projects/discovery-research/SESSION-TRANSCRIPT-2026-05-19.md`
- Memory files: `~/.claude/projects/-Users-krishnabrown-product-enrichment/memory/MEMORY.md` (index)
- Session notes: `.claude/SESSION_NOTES.md`

---

## Checklist (append this block to every response)

```
─── Path A+C Plan ───────────────────────────────────
1. ✅ Linear roadmap audit (docs/path-a-c-linear-audit-2026-05-19.md)
2. ☐ Path A PRD (ShopGraph + Operator Review)
3. ☐ Path C PRD (Agent Identity)
4. ☐ shopgraph.dev website update
5. ☐ Distribution / marketing plan
6. ☐ Existing surfaces audit (MCPs, n8n, Make, PRs)
7. ☐ Implementation plan (via writing-plans skill)
Full plan: docs/path-a-c-plan.md
─────────────────────────────────────────────────────
```

Legend: `☐` not started | `⏳` in progress | `✅` done | `✕` deferred / cancelled

---

## What each path is

### Path A — ShopGraph + Operator Review (commerce-first)
ShopGraph evolves from extraction API to **extraction with confidence-gated escalation paths**. When a field falls below confidence threshold, the system routes an escalation to a human reviewer with output + evidence + act controls. Reviewer approves / rejects / requests re-extraction. Audit trail included. Pricing: per-seat for reviewer seats; subscription for API.

### Path C — Agent Identity as a service (separate, longer horizon)
Neutral third-party trust bureau for agents. Four layers: credentials, provenance, behavioral reputation (the novel one), outcome tracking. Thin-file scoring from public data (MCP registries, npm, GitHub) is buildable immediately. Behavioral reputation takes 6–18 months of instrumented data. ShopGraph's RFC 9421 + `.well-known/agent-card.json` infra is the reference implementation.

---

## Step details

### 1. Linear roadmap audit
**Goal:** Categorize every open ShopGraph ticket as KEEP / MODIFY / CANCEL / NEW against Path A direction.
**Output:** `docs/path-a-c-linear-audit-2026-05-19.md`
**Status:** ✅ Done 2026-05-19
**Result:** 22 open tickets reviewed → 7 KEEP / 10 MODIFY / 5 CANCEL / 6 NEW
**Next:** KB review of audit; validate categorizations; decide order of execution (some ticket bodies need rewriting before Path A PRD lands)

### 2. Path A PRD — ShopGraph + Operator Review
**Goal:** Product spec for evolving ShopGraph to "extraction with confidence-gated escalation paths."
**Output:** `docs/specs/YYYY-MM-DD-path-a-shopgraph-operator-review.md`
**Status:** ☐ Not started — **next action**
**Inputs available:** Linear audit complete, corrected positioning, verified customers, operator review design notes
**Workflow:** sub-agent drafts → Claude reviews/adjusts → KB reviews → final
**Covers:** product story, positioning, user flows (developer integration + reviewer experience), architecture, escalation payload schema, review UI, routing (Slack/email/webhook), persistence, pricing model (per-seat for reviewers + subscription for API), v1 scope vs deferred, open questions, risks
**Sub-agent prompt notes:** anchor on `shopgraph-positioning-corrected.md` and `discovery-research-findings-2026-05.md` memory files; reference Linear audit; flag any design decisions for KB rather than locking them; include Pattern E (reviewer correction rate dashboard) as a v1 differentiator

### 3. Path C PRD — Agent Identity
**Goal:** Product spec for agent trust/reputation layer as standalone service.
**Output:** `docs/specs/YYYY-MM-DD-path-c-agent-identity.md`
**Status:** ☐ Not started
**Workflow:** sub-agent drafts → Claude reviews/adjusts → KB reviews → final
**Covers:** product story, layer scope (which of 4 in v1), public data ingestion (MCP registries / npm / GitHub), manifest spec extending agent-card.json, cold start strategy, trust model, v1 scope, risks (gaming, regulatory)
**Open decision for KB at session start:** v1 scope — layers 1+2 only, or 1+2+3 thin-file scoring, or sub-agent presents both options? Default to "present both" if undecided.

### 4. shopgraph.dev website update
**Goal:** Reflect corrected positioning + add operator review surface
**Status:** ☐ Not started
**Inputs needed:** Path A PRD (step 2) complete
**Covers:** homepage positioning fix, new `/operator-review` page, updated `/features/confidence`, demo animation showing e2e flow, pricing page update for reviewer seats

### 5. Distribution / marketing plan
**Status:** ☐ Not started
**Inputs needed:** Path A PRD positioning locked
**Covers:** LinkedIn posts, HN Show HN strategy (post-build, not pre), direct outreach to verified customers (Wiser, Thomasnet, Sovrn, Skimlinks), captive-audience communities (agent infra Discord, MCP community)

### 6. Existing surfaces audit (keep / modify / deprecate)
**Status:** ☐ Not started
- MCP server listings: Glama, Smithery, mcp.so, mcpservers.org, Official MCP Registry
- `n8n-nodes-shopgraph` npm package
- `make-shopgraph` custom app
- Vercel AI SDK PR #14464
- LangChain cookbooks PR #5
- Stripe MPP per-call pricing ($0.02/enrich_product)

### 7. Implementation plan
**Goal:** Detailed implementation breakdown via writing-plans skill
**Status:** ☐ Not started
**Inputs needed:** Path A PRD + Path C PRD approved

---

## Key constraints (carry across all steps)

- Banned terms (CLAUDE.md): deterministic, guaranteed, scraping/scraper, bypass/circumvent, "the first" (unqualified)
- No negative framing ("if you're on Ariba, you don't need us")
- Open web blocking is real: Grainger, Home Depot, Amazon, McMaster-Carr block serverless IPs. Long tail is the positioning, not big-box stores.
- Per-operation pricing is rejected (HumanLayer lesson). Per-seat for reviewer; subscription for API.
- ShopGraph positioning: "First per-field confidence for product data extraction with commerce-specific schemas and human-readable method attribution." NOT "first per-field confidence" (document AI has that).

---

## Verified customer targets (from session research)

- **Wiser Solutions** — entire business is structured extraction from arbitrary retailer URLs (200M+ prices/day). Strongest fit.
- **Thomasnet** — industrial supplier data normalization product line. Spec extraction use case.
- **Sovrn Commerce** — merchant feed covers structured retailers; ShopGraph fills long-tail coverage gap.
- **Skimlinks** — same as Sovrn, built "Product Key" for product data enrichment.

---

## Decision log

### 2026-05-19 — Direction set
- Path A and Path C confirmed as the two product directions
- Commerce/shopping first for both
- ShopGraph positioning corrected
- Per-operation pricing rejected
- Negative framing removed
- Open web blocking acknowledged; long tail is the strategy
- Session transcript: `~/Documents/Claude/Projects/discovery-research/SESSION-TRANSCRIPT-2026-05-19.md`

### 2026-05-19 — End of session decisions
- Linear ticket hygiene **on hold** until Path A PRD lands (don't rewrite ticket bodies twice)
- PRD workflow: sub-agent drafts → Claude reviews/adjusts against session context → KB reviews → finalize
- DRAFT vs final filename pattern: `docs/specs/YYYY-MM-DD-{path}-DRAFT.md` → `docs/specs/YYYY-MM-DD-{path}.md`
- Next session opens with: confirm Path C v1 scope question, spawn Path A PRD sub-agent first
