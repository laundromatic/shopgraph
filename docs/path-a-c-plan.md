# Path A + Path C — Active Plan (SUPERSEDED 2026-05-31)

> **⚠️ SUPERSEDED.** This document is historical. The "Path A + Path C" framing was retired at end of session 2026-05-31 after Path C was cancelled and Path A was paused pending broader discovery research. The active source of truth is `docs/next-session-handoff.md`. The failure-mode log is in `.claude/SESSION_NOTES.md`. Do not work from this file for active planning.

**Last updated:** 2026-05-31 (marked superseded)
**Domain focus at the time:** Commerce/shopping first; architecture generalizes

---

## How to resume (read this first on next session)

**State at session end (2026-05-31):**
- ✅ Linear roadmap audit complete → `docs/path-a-c-linear-audit-2026-05-19.md`
- ✅ Path C reframed after 4-track research (workload identity dropped, off-chain behavioral reputation is the surviving direction) → see step 3 below
- ⏸ Linear ticket hygiene **on hold** until Path A PRD lands (KB decision 2026-05-19)
- → **Next action:** spawn Path A PRD sub-agent (Path C PRD waits for KB approval of reframe + v1 wedge decision)

**PRD workflow (KB decision, 2026-05-19):**
1. Sub-agent drafts PRD to `docs/specs/YYYY-MM-DD-{path}-DRAFT.md`
2. Claude reviews against session context, annotates/edits inline, flags decisions for KB
3. KB reviews, section by section
4. Final PRD written to `docs/specs/YYYY-MM-DD-{path}.md`

**Open decisions to bring to KB at session start:**
- Approve Path C reframe (off-chain behavioral reputation, commerce-first) → confirm before Path C PRD spawn
- Path C v1 wedge: consumer affiliate-disclosure badge (regulatory tailwind) OR enterprise procurement rubric (sharper buyer) OR sub-agent presents both. *(Default: present both if undecided.)*
- Path A and Path C sub-agents in parallel, or A first then C? *(Default: A first.)*

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
3. ☐ Path C PRD (Off-Chain Behavioral Reputation)
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

### Path C — Off-Chain Behavioral Reputation for AI Agents (reframed 2026-05-31)
Off-chain behavioral reputation layer for AI agents, anchored on consumer trust signals for agentic commerce. The original "broad agent identity service" framing is dead — workload identity is fully claimed by IAM giants + ~$1B in funded startups (Microsoft Entra Agent ID, Google Cloud IAM, Okta for AI Agents, Keycard $38M, SGNL $628M exit, Oasis $120M, et al.). The off-chain reputation space is empty. Crypto/ERC-8004 owns on-chain (different buyer). Consumer-facing "Trustpilot for agents" destination is unclaimed. Fork-aware reputation and behavioral lineage are KB coinages with zero public competition. Path A's extraction + confidence pipeline is the behavioral substrate Path C consumes.

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

### 3. Path C PRD — Off-Chain Behavioral Reputation for AI Agents

**Reframed 2026-05-31** based on four-track research. Old framing ("broad agent identity service") is dead — workload identity space is fully claimed by IAM giants + ~$1B in funded startups (Microsoft Entra Agent ID, Google Cloud IAM Agent Identity, Okta for AI Agents, Keycard $38M, SGNL $628M exit, Oasis $120M, Andromeda Security, Natoma→Snowflake, Clutch, Anetac, Astrix→Cisco, Otterize→Cyera, BentoLabs, Runtime, Sentrial).

**Reframed goal:** Off-chain behavioral reputation layer for AI agents, anchored on consumer trust signals for agentic commerce. Crypto/ERC-8004 owns on-chain; off-chain is empty.

**Working name:** *Off-chain behavioral reputation for AI agents — starting with consumer trust signals for agentic commerce.*

**Why this survives all four research tracks** (full evidence in `~/Documents/Claude/Projects/discovery-research/agent-reputation-*-2026-05-31.md` and `agent-identity-startups-2026-05-31.md`):

| Evidence | Source |
|---|---|
| 75% of Americans would lose trust if shopping agents serve sponsored results (Quad/Harris, n=2,180) | Agent 2 |
| 98% of consumers verify AI recommendations before buying (Idea Grove) | Agent 2 |
| FTC March 2026 + EU AI Act August 2026 mandate AI affiliate disclosure — no consumer-visible "Paid Partnership" badge exists | Agent 2 |
| G2 absorbed Capterra/SoftwareAdvice/GetApp Jan 2026 (55-58% review influence) but agent review schema is SaaS-shaped — no hallucination/rollback/override axes | Agent 2 |
| Workload identity is fully claimed; behavioral reputation off-chain is empty (only Vouched in lane) | Agents 1+3 |
| ACHIVX framing — *"Identity tells you who is at the door. It does not tell you how that actor behaves once the door opens."* / *"In the agentic economy, reputation is collateral."* — repeats across ≥6 sources | Agent 1 |
| ERC-8004 (authors from MetaMask, Ethereum Foundation, Google, Coinbase) mainnet 2026-01-29, 30k+ registrations in days — but on-chain only | Agents 1+4 |
| Princeton: same agent + same input → 2.0-4.2 distinct action sequences per 10 runs ("When Agents Disagree With Themselves") | Agent 1 |
| Phoenix Medium "I Mass-Deployed an AI Coding Agent. Then the Model Updated and Nobody Told Me" + Anthropic claude-code #31480 / #46935 quality regression — practitioners feeling pain, framing as bugs not reputation | Agent 4 |
| `@rep_hq` on X: *"Human verification is the choke point... The agent problem is solved by reputation attached to the agent"* — worth direct outreach | Agent 4 |

**The four gaps to position into:**
1. Off-chain (non-crypto) behavioral reputation — empty category
2. Consumer-facing "Trustpilot for agents" destination — empty (AgentFolio is registry, not destination; Trustpilot itself is positioning the inverse)
3. Fork-aware reputation as a specific primitive — KB's coinage, zero public conversation
4. Enterprise procurement rubric — buyers have no language for scoring agents they are considering

**Working vocabulary:**
- HIGH signal (use to reach existing conversation): *agent reputation, agent trust layer, agent passport, AgentRank, behavioral fingerprint*
- LOW signal but DEFENSIBLE (own these): *fork-aware reputation, behavioral lineage, off-chain reputation infrastructure*
- AVOID conflation with: workload identity, agent IAM, agentic IAM, agent authn

**Direct outreach candidate identified:** `@rep_hq` on X — articulates exact thesis. https://x.com/rep_hq/status/2056722041789702237

**Path A overlap (why this is one coherent portfolio, not two unrelated products):**
ShopGraph's extraction + confidence + escalation pipeline IS the behavioral substrate. *"This shopping agent's last 1000 product recommendations had a 12% return rate, sourced from extractions with average 0.71 confidence, 14% requiring human review."* That fingerprint is something no on-chain product can build without an off-chain extraction layer. Path A produces the data; Path C consumes it.

**Output:** `docs/specs/YYYY-MM-DD-path-c-behavioral-reputation.md`
**Status:** ☐ Not started — ready for sub-agent PRD draft after KB approves this reframe
**Workflow:** sub-agent drafts → Claude reviews/adjusts → KB reviews → final
**Covers:** product story, segmentation (consumer / SMB / enterprise procurement), v1 wedge (likely consumer affiliate-disclosure badge driven by FTC/EU AI Act, or enterprise procurement rubric — pick one with KB), behavioral signal sources (extraction outcomes, model version drift, reviewer overrides, agent-action audit trails), on-chain interop (read ERC-8004 if present, do not require it), positioning against ACHIVX/AgentFolio/Recall, integration with Path A, risks (gaming, cold start, legal exposure), open questions

**Open decision for KB before PRD spawn:** Which v1 wedge — consumer affiliate-disclosure badge (regulatory tailwind, brand-driven, slower B2B) or enterprise procurement rubric (faster sales, sharper buyer)? Sub-agent can present both options in the draft if undecided.

---

**Original Path C competitive intel kept below for record (pre-reframe, 2026-05-19 → 2026-05-31):**


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

## Research methodology gaps (to fix before next discovery wave)

Identified 2026-05-31 after AgentFolio surfaced through user, not through discovery tasks:

1. **GitHub Discussions not queried.** task-collaboration-pain searched GitHub Issues on major agent frameworks but not Discussions. Discussions is where feature requests and product announcements (like AgentFolio's AutoGen #7363) often land first. Add Discussions API search to next wave.
2. **"Agent trust score / reputation / verification" vocabulary not searched.** Discovery tasks searched HITL primitives, agent identity (RFC 9421 angle), and review surfaces — but not the specific category of "score/rate/verify the agent itself." Add this vocabulary to next wave.
3. **Web3/crypto-native agent products not in scope.** A whole category of products built on Solana, Ethereum, etc., for agent identity/marketplace is invisible to discovery tasks that focus on traditional SaaS / OSS / framework spaces. Decide explicitly whether crypto-native products are competitors or out of scope.
4. **Once a Path C-like product idea is named in conversation, run a fresh focused competitive search before treating it as novel.** This was the gap that let AgentFolio go unfound. Synthesis ≠ verification.
5. **Major IAM vendor product launches not monitored.** Microsoft Entra Agent ID, Google Cloud IAM Agent Identity, Okta for AI Agents, Palo Alto IDIRA — all shipped or framework-published May 2026. Discovery tasks did not check Microsoft / Google / Okta blogs, did not search "AI agent IAM" or "agentic IAM," did not include r/cybersecurity (30+ comment thread on this topic), did not check enterprise security vendor whitepapers or Gartner/Forrester coverage. The research thought the agent identity space was emerging because it was looking in agent-developer communities, not where enterprise security products live. **This is the largest methodology gap from the May 2026 research.**

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
- Next session opens with: confirm Path C v1 scope question, spawn Path A PRD sub-agent

### 2026-05-31 — Path C reframe (significant)
**What changed:** Original Path C ("broad agent identity service, 4 layers") was killed and replaced with "off-chain behavioral reputation for AI agents, commerce-first."

**Triggered by:** KB surfaced (via Google search) Microsoft Entra Agent ID, Google Cloud IAM Agent Identity, Okta for AI Agents, Palo Alto IDIRA, Dock Labs, Andromeda Security, AgentFolio — all missed by May discovery. Plus the Reddit r/AI_Agents "Why Agent Identity Is the Wrong Question" post and KB's Trustpilot-for-agents reframe.

**Four parallel research sub-agents** dispatched 2026-05-31, all completed:
1. Behavioral reputation general → `~/Documents/Claude/Projects/discovery-research/agent-reputation-2026-05-31.md`
2. Consumer + SMB segments → `~/Documents/Claude/Projects/discovery-research/agent-reputation-consumer-smb-2026-05-31.md`
3. Andromeda + adjacent startups → `~/Documents/Claude/Projects/discovery-research/agent-identity-startups-2026-05-31.md`
4. X.com cross-reference → `~/Documents/Claude/Projects/discovery-research/agent-reputation-x-signals-2026-05-31.md`

**Confirmed:** Workload identity space is fully claimed (~$1B+ funded). Off-chain behavioral reputation is empty. ERC-8004 owns on-chain. Consumer + regulatory tailwind for agentic commerce trust signals is the strongest commercial wedge.

**Performance failures from this session** documented in `.claude/SESSION_NOTES.md` for future-session learning. first
