# Next Session Handoff — Restart Discovery with Rubric Discipline

**Created:** 2026-05-31 (end of session 7fbfc7e2)
**Purpose:** Single source of truth for what the next session must do. Supersedes `docs/path-a-c-plan.md` for active-plan tracking.

> **For Claude on next session:** Read this file first. Then read `.claude/SESSION_NOTES.md` for the failure-mode log. Do not start building or writing PRDs until research wave 2 completes and KB approves a direction.

---

## State at session end (2026-05-31)

- ✅ Linear roadmap audit complete: `docs/path-a-c-linear-audit-2026-05-19.md`
- ✅ Path C cancelled — agent identity/reputation does not fit KB's constraints (solo, no partnerships, no crypto, tool user must be developer/agent or honest-fit equivalent)
- ⚠️ Path A (ShopGraph + Operator Review) **PRD on hold**. Path A has Step 1 + Step 4 weakness in rubric. ShopGraph has zero paying users; customer demand for confidence-gated escalation is inferred, not validated.
- ⚠️ Path A may still be worth shipping as a portfolio completion piece (extends ShopGraph's substrate), but should NOT be locked as the primary product direction until research wave 2 informs whether something stronger exists.
- ⏸ Linear ticket hygiene on hold until product direction is clear (avoid rewriting tickets twice).
- 📋 Discovery research wave 2 not yet started — this is the next action.

---

## Failure-mode log from session 7fbfc7e2 (read before designing new tasks)

These are the patterns that caused this session to spend hours producing reframes that all failed the rubric. They MUST be designed out of next-wave task prompts.

1. **Going to Step 5 (gap analysis) before Steps 1–4.** Every Path C reframe led with "the gap is real" without first showing behavioral evidence the problem was experienced. PROJECT.md is explicit: "Gap ≠ need. Prove the need before assessing the gap."

2. **Skipping tool-user identification.** PROJECT.md requires every finding to state the tool user (developer / agent / both). I oscillated between consumer, buyer, user, SMB, enterprise procurement without pinning it. Each different user implies a different product.

3. **Conflating supply gap with demand evidence.** "No incumbent ships X" is supply, not demand. Demand is "people are trying to solve X with workarounds and the workarounds are inadequate."

4. **Not checking data accessibility against KB's no-partnerships constraint.** Multiple reframes assumed data (return rates, transaction outcomes, agent recommendation history) that KB cannot access without partnerships. The reputation framing keeps failing because reputation requires substrate that requires partnerships.

5. **Not running rigorous rubric on Path A — assumed it passed because of sunk cost.** ShopGraph is built and deployed but has zero users. Extending it with operator review is plausible but not validated. I treated Path A as "the safe option" without applying the same rigor.

6. **Anchoring on a single hypothesis and reframing instead of restarting research.** When Path C kept failing, I reframed it 4+ times instead of dropping it and going back to broader discovery. Each reframe was a different way to violate a different criterion.

7. **Not returning to KB's original asks.** KB explicitly asked early in the session for: agentic commerce e2e mapping, opportunities across the trust layer, risks in agentic commerce, B2B vs consumer adoption analysis. None of these were executed. A `discovery-commerce-pipeline-e2e` task was drafted but never run.

8. **Cross-referencing X.com / LinkedIn / Gmail was missed.** KB instructed earlier sessions to use her authenticated sources. The four discovery tasks I ran did not use her authenticated access. A whole class of signals from her real professional network was invisible.

9. **Used abstract thesis vocabulary in some searches** ("human-agent collaboration") instead of domain vocabulary. KB had to call this out mid-session. The corrected vocabulary worked; the original didn't.

10. **Missed major-vendor product launches** (Microsoft Entra Agent ID, Google Cloud IAM Agent Identity, Okta for AI Agents, Palo Alto IDIRA) entirely. KB surfaced them via a simple Google search. The discovery research did not check enterprise security vendor blogs, Reddit r/cybersecurity, or analyst coverage. This produced false confidence that the agent identity space was unclaimed.

---

## Upfront checklist every CoWork task must include

Bake these into the task prompt itself, not as post-hoc filters:

1. **Identify the tool user for every finding.** Developer / agent / both / SMB owner / consumer. If consumer, flag explicitly — it is out of PROJECT.md's literal scope and requires KB judgment.

2. **Apply PROJECT.md rubric in order, not Step 5 first:**
   - Step 1: Is the problem experienced? (behavioral evidence — workarounds, custom builds, hired headcount)
   - Step 2: How widespread? (≥6 sources, ≥4 source types)
   - Step 3: Are people trying to solve it but can't? (attempted solutions, where they fail)
   - Step 4: Would they adopt a purpose-built tool? (adoption signals for adjacent products, pricing proxies)
   - Step 5: Is the gap real? (incumbents check — ONLY after 1–4 pass)

3. **Check data accessibility against KB's hard constraints:**
   - No partnerships
   - No customer-dependent access
   - No authenticated portal access (no relationship-required data)
   - No crypto stack
   - Solo founder
   - If the product requires data only obtainable via partnership, flag and downgrade.

4. **Check autonomous buildability:** Days, weeks, or months? COWORK_BRIEFING.md target is days. Months is a flag.

5. **Cross-reference KB's actual sources:** Gmail (authenticated), LinkedIn (authenticated), X.com (authenticated). Bluesky and Mastodon if relevant. Practitioners on these surfaces are invisible to public web search.

6. **Use domain vocabulary, not abstract thesis vocabulary.** Search "approval queue," "fraud analyst review," not "human-agent collaboration." Search the words practitioners actually use.

7. **Distinguish forward bet from current pain explicitly.** PROJECT.md allows both opportunity types but they require different evidence (current pain = full rubric; forward bet = credible institutional backers + trajectory + structural dependency).

8. **Active search for counter-evidence on every finding.** "Why hasn't someone built this?" is a valid question. Negative findings count.

9. **Identify whether KB can capitalize.** Distribution model, defensibility, time-to-market, fit with her positioning as AI Workflow Designer / Architect.

10. **Do not anchor to ShopGraph, agentic commerce, or any prior product framing.** Let the domain emerge from evidence. Commerce is a starting point, not a constraint. Findings outside commerce that are stronger should be reported as such.

---

## Proposed research wave 2 (for KB sign-off before spawning)

CoWork can use KB's authenticated Gmail / LinkedIn / X.com access. Terminal sub-agents can't. Use CoWork for tasks that need authenticated sources; terminal sub-agents for everything else.

### Task 1 — Agentic commerce e2e map (KB's original ask, executed properly)
Map every stage an agent navigates in commerce: discovery → evaluation → comparison → purchase → checkout/payment → post-purchase (returns, support, dispute). For each stage:
- Who is the tool user (developer / agent / SMB / consumer — be explicit)
- Documented pain (behavioral evidence per rubric Step 1)
- Existing tools/incumbents
- What data exists without partnerships
- What KB could plausibly capitalize on given constraints

### Task 2 — Email + LinkedIn signal scan (KB's actual network)
Use KB's Gmail and LinkedIn auth. Find:
- What her professional network is building / complaining about (last 60 days)
- What roles are being hired (job titles, responsibilities)
- What topics recur across multiple contacts
- Apply rubric to every recurring signal before flagging as opportunity

### Task 3 — X.com + Reddit practitioner pain scan (broad, not commerce-only)
Open the aperture beyond identity / agentic commerce. Find practitioner pain across:
- Workflow automation
- Agent orchestration
- Agent evaluation
- Agent ops / deployment
- Agent monitoring / drift
- AI-assisted work in specific domains (legal, healthcare, finance, support, marketing, ops)
- Anywhere humans and agents collaborate
Apply rubric upfront. Identify tool user per finding. Check data accessibility.

### Task 4 — Falsification + adjacency check for every surfaced opportunity
For each problem surfaced in tasks 1–3:
- Nearby products that already address it
- Honest autonomous-buildability (days / weeks / months)
- Whether KB's constraints (solo, no partnerships, no crypto) allow capitalizing
- TrustGate parallel check: is this trivially DIY?

### Task 5 — Re-evaluate the ideas this session surfaced but never rubric-tested
The session produced findings that were treated as patterns but not as candidate products:
- Multi-agent coordination primitive (task-collaboration-pain Finding B)
- Sidecar/proxy guardrail enforcement (signals scan N6)
- Reviewer correction rate dashboard (Pattern E)
- DRI / agent operator tooling (signals scan J1, Wolfe job posting)
- VoiceForge (never researched as a product)
- Atlas pattern tooling (never researched as a product)
Apply rubric to each. Identify tool user. Check feasibility against KB's constraints.

---

## What this is NOT

- Not a recommendation to commit to any specific product
- Not a validation of Path A or any other prior framing
- Not a hypothesis to defend
- It is: a discovery wave that opens the aperture, applies the rubric properly, and surfaces what evidence supports before any build decision

---

## Files to consult on resumption

| File | Purpose |
|---|---|
| `docs/next-session-handoff.md` (this file) | Active source of truth |
| `.claude/SESSION_NOTES.md` | Failure log, prior decisions |
| `docs/path-a-c-linear-audit-2026-05-19.md` | Historical: Linear ticket categorization |
| `~/Documents/Claude/Projects/discovery-research/SESSION-TRANSCRIPT-2026-05-19.md` | Verbatim transcript of session 7fbfc7e2 (~296KB, 137 messages) |
| `~/Documents/Claude/Projects/discovery-research/agent-*-2026-05-31.md` | Wave 1 research findings (still useful as Tier 2 source material, NOT as validation of Path C) |
| `docs/path-a-c-plan.md` | Historical: prior plan with Path A+C framing. **Superseded by this file.** |
| `~/.claude/projects/.../memory/MEMORY.md` | Memory index |

---

## Open question for KB at session start

Path A — ship anyway as a portfolio completion piece (honestly framed as "extends ShopGraph, demand inferred not validated"), or pause and let research wave 2 inform whether to invest the build time elsewhere?
