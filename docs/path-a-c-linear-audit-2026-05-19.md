# Linear Roadmap Audit — Path A + Path C (2026-05-19)

Source data: `mcp__linear__linear_getProjectIssues` against SpinOuts project
`52fb78a7-28c7-4d93-9973-00477f8d1337` on 2026-05-19. Read-only — no Linear
state was changed.

Scope: ShopGraph-related tickets only. Excluded: SceneInBloom, Atlas
(LAU-254/255/323), kb.computer, TrustKit, TrustMem, VeryBoringUI, and the
Product-Enrichment epic (LAU-256/248–252 — pre-pivot framing, not in audit scope
per instructions).

## Summary

- Total open ShopGraph tickets reviewed: 22
- KEEP: 7
- MODIFY: 10
- CANCEL: 5
- NEW tickets needed: 6

## KEEP (aligned with Path A)

- **LAU-287** Per-field confidence scoring architecture — In Progress — The confidence signal is the trigger for the operator-review escalation. Phase 1+1b shipped; Phase 2 calibration (`Pearson R > 0.70`) is exactly the validation Path A requires to make escalation thresholds defensible. No framing change needed.
- **LAU-274** Self-healing extraction quality system — In Progress — Regression suite + calibration pipeline is the evidence layer behind every escalation decision. Keep as-is; this is the data-quality moat that Path A depends on.
- **LAU-260** Live Quality Dashboard — In Progress — Daily rolling test corpus across B2B + B2C verticals. Direct support for the verified customer story (Wiser/Thomasnet/Sovrn need to see ShopGraph works on commerce URLs at scale). Fix the broken cron — keep the scope.
- **LAU-321** Categories empty on Johnny's Seeds — Todo — Concrete extractor bug on a commerce vertical. Path A demands ShopGraph is honest about what it can/can't extract; "0 items" UI lie is the opposite of "shows its work." Keep.
- **LAU-324** Codify development hygiene as automated guardrails — In Progress — Cross-cutting infra hygiene. Not strategy-coupled but actively protecting velocity. Keep.
- **LAU-326** Hook to warn on scheduled n8n/Make triggers — Todo — Child of LAU-324; concrete enforcement after the 2026-01-30 and 2026-04-29 incidents. Keep.
- **LAU-262** ShopGraph Evolution: Q2 2026 (Epic) — Backlog — Repurpose this epic to hold Path A work. Keep the parent; rewrite the body in the MODIFY pass below.

## MODIFY (relevant, scope/framing change needed)

- **LAU-298** Access Readiness Leaderboard — In Progress — Current scope: public scoreboard + pSEO `/extract/*` pages + embed badge. **Change**: drop the embed-badge and access-readiness-active gating (depends on Cloudflare registry which has not moved). Reframe as "Commerce extraction leaderboard with operator-review escalation badge per row" — when a domain has fields below threshold, show how many escalations were generated in the daily run. The leaderboard becomes a demonstration of Path A, not a Cloudflare bet.

- **LAU-275** AgentReady scoring API — In Progress — Current scope: 6-dimension agent-readiness score with access_readiness weight gated on RFC 9421 adoption. **Change**: drop the "access_readiness" dimension (Path C territory, separate product) and the "open methodology authority play" framing. Keep the per-field commerce-completeness scoring as input to the operator-review queue ("which fields need a human?"). Reweight to 5 dimensions; remove the AgentReady-as-standalone-brand thread.

- **LAU-281** Landing page B2B expansion — In Progress — Current scope: site-wide redesign locked on "Authenticated product data extraction" 1-liner, RFC 9421 hero subhead, dual B2C/B2B showroom. **Change**: replace the 1-liner with the corrected Path A positioning ("Per-field confidence for product data extraction with commerce-specific schemas and human-readable method attribution"). Drop the "authenticated extraction proxy" + "fast lanes" + "identity handshake" hero subhead. Lead the hero with confidence + method attribution + escalation; commerce/shopping first; surface the verified customer story (Wiser/Thomasnet/Sovrn use cases).

- **LAU-288** UCP compliance positioning audit — Todo — Current scope: rewrite all copy to the "authenticated extraction proxy / RFC 9421 / fast lanes" identity. **Change**: rewrite again to the corrected positioning. UCP compliance stays as a real feature; "authenticated proxy" framing is dropped (it overweighted the identity layer that's now scoped to Path C). Also enforces banned terms from corrected memory: drop "first per-field confidence" — replace with "per-field confidence for product data extraction with commerce-specific schemas."

- **LAU-280** Submit ShopGraph integration PRs to agent frameworks — In Progress — Current scope: Vercel AI SDK + LangChain submitted; CrewAI/AutoGen/Mastra remaining; templates lead with `force_refresh` + RFC 9421 access-readiness narrative. **Change**: rewrite remaining PR templates around confidence + escalation, not authentication-through-CDNs. Specifically: the CrewAI procurement template should demonstrate the operator-review handoff (Wiser-style price intelligence with human-fallback on low confidence).

- **LAU-282** GTM Distribution (parent) — In Progress — Current scope: framework PRs, automation nodes, B2B decision-maker reach. **Change**: rewrite strategy section. Drop the Cloudflare/GoDaddy timing hook. Replace with verified-customer outreach (Wiser, Thomasnet, Sovrn, Skimlinks) and operator-review demo as the lead. Keep the channel matrix.

- **LAU-292** Sprint outreach — Stripe, social, community, registry sync — Backlog — Current scope: Stripe Jennifer Lee email + LinkedIn/X threads built around CF/GoDaddy news cycle and "authenticated extraction proxy." **Change**: rewrite Stripe email to lead with operator-review as the actual MPP unlock (agent pays + human-gates the action when confidence is low). Drop "Fast Lanes, Not Toll Roads" blog. Reissue social posts around per-field confidence + commerce escalation.

- **LAU-259** MCP Directory Registration — In Progress — Current scope: cross-directory listings with Phase 4 "extraction API that shows its work" copy. **Change**: refresh listing copy to corrected Path A positioning. Keep CVE / dependency hygiene work and Smithery quality re-publish; these are infrastructure. Most listings already drift from current strategy — needs another pass.

- **LAU-310** Clarify purpose of self-healing / routing / playground pages — Todo — Current scope: decide between three options for routing-engine demo vs playground vs self-healing page. **Change**: route the decision toward Path A. The self-healing page becomes the operator-review demo (show what happens to low-confidence fields). The routing engine demo gets archived or folded into playground. Solves the page-overlap problem and gives Path A its demo surface in the same move.

- **LAU-293** Interactive playground — threshold slider, UCP toggle, confidence display — Backlog — Current scope: confidence display, threshold slider, UCP toggle, Force Live Fetch radio. **Change**: extend playground to render the operator-review surface in-line. When a field falls below the slider's threshold, show the queue card: value + evidence (method, source, confidence) + action buttons (approve, reject, request re-extraction). Turns the playground into the Path A demo.

## CANCEL (superseded or no longer needed)

- **LAU-296** RFC 9421 Web Bot Auth & Agent Registry Identity — In Progress — Infrastructure is shipped (Ed25519 signing, `.well-known/agent-card.json`, RFC 9421 headers). Remaining work is Cloudflare Agent Registry + GoDaddy ANS registration + behavioral reputation management. **Cancel reason**: per the corrected direction, agent identity / behavioral reputation is Path C (separate product, 6-18 month horizon for behavioral data). The shipped pieces remain valuable as the reference implementation cited in Path C; don't keep this ticket open burning attention on Cloudflare registry submissions for the ShopGraph extraction API. Move outstanding registry-submission work to a new Path C ticket.

- **LAU-297** Commerce pain monitoring agent (n8n workflow) — Backlog — **Cancel reason**: This is outreach automation built around the "authenticated extraction proxy / RFC 9421" identity that's being dropped. Path A leads with verified customers (Wiser, Thomasnet, Sovrn) not scraping-pain-on-GitHub. The n8n approach also conflicts with CLAUDE.md polling-budget rule (4-hour cron = 180 executions/month per source × N sources). Cancel; if outreach automation is wanted later, design it without scheduled polling.

- **LAU-300** CDN Compatibility Guide — "For Merchants: Make Your Site Agent-Ready" — Backlog — **Cancel reason**: Entirely scoped around Cloudflare WAF rules, RFC 9421 verification, ShopGraph's ASN whitelisting. This is Path C messaging (agent identity), not Path A. Tells merchants how to verify ShopGraph's RFC 9421 signature — which is a separate product now.

- **LAU-284** Power Automate custom connector — Backlog (P4) — **Cancel reason**: Enterprise procurement channel for an extraction API. Path A's enterprise story routes through verified customers (Wiser, Thomasnet, Sovrn) as design partners, not through Power Automate's connector marketplace. P4 already signals low conviction; cancel.

- **LAU-289** Show HN launch — Backlog — **Cancel reason**: Post body built entirely around "RFC 9421 + CF/GoDaddy news cycle" framing. The hook ("tells you when it's guessing") is good but the supporting structure is Path C. Cancel and re-file as a Path A Show HN that leads with the operator-review surface as the differentiator. (See NEW section below.)

## NEW (gaps Path A requires)

- **Operator review surface — core build (P1)** — Build the in-product surface where low-confidence fields surface to a human reviewer with output + evidence + act. Per-seat pricing for reviewers (HumanLayer per-operation pricing is explicitly out). This is the single load-bearing build for Path A.

- **Verified customer outreach — Wiser, Thomasnet, Sovrn, Skimlinks (P1)** — Direct outreach to verified targets identified in discovery research. Goal: 1-2 design partners on operator-review surface within 60 days. No public posting, no MCP-directory, no Show HN until at least one design-partner conversation.

- **Reviewer-correction-rate measurement & dashboard (P2)** — Pattern E in research found no vendor publishes reviewer correction rate vs AI confident-wrong rate. Instrument the operator-review surface from day one to capture this. Becomes a published metric and the lead chart in any case study. Direct counter-positioning vs HumanLayer.

- **Operator-review demo page on shopgraph.dev (P2)** — Standalone page that demonstrates the escalation flow with sample products. Becomes the link in customer outreach, the Show HN demo, and the LinkedIn post visual. Could absorb LAU-310's self-healing page slot.

- **Path A pricing page rewrite (P2)** — Replace per-call/credit pricing as the lead. Free tier playground + per-seat operator-review pricing for paid. Per-operation pricing for the reviewer surface is banned (HumanLayer lesson). Closely connected to LAU-316 (self-serve upgrade path) which can be repurposed for reviewer-seat checkout instead of API-key signup.

- **Path C — Agent Identity product spin-out (P3, separate epic)** — Carve out a new epic for Agent Identity as Path C: the RFC 9421 reference implementation (already shipped under LAU-296), the credential/scope + provenance + behavioral reputation + outcome tracking layers, and registry registrations. Keeps the shipped infrastructure visible while removing it from the ShopGraph extraction roadmap.

## Done — relevant shipped infrastructure

- **LAU-287 Phase 1 + 1b** — Tier-based confidence scoring, decay model, execution flags (`force_refresh`, `minimum_confidence`, `strict_confidence_threshold`), credit pricing. This is the confidence signal Path A's escalation surface consumes.
- **LAU-296** — Ed25519 keypair, `.well-known/agent-card.json`, RFC 9421 signing in `src/agent-identity.ts`, dormant `src/access-probe.ts` engine. Cited as Path C reference implementation; production-deployed and verifiable.
- **LAU-275 scoring engine** — `POST /api/score`, 6-dimension scoring. Per Path A, drop the 6th access-readiness dimension; keep the 5-dim commerce completeness score as the operator-review queue input.
- **LAU-273** UCP-compatible output format — `?format=ucp` is shipped; remains a real interoperability feature for Path A even though the "UCP-compliance positioning" narrative is being dropped.
- **LAU-283** n8n community node v1.0.1 — Live on npm. Useful distribution channel for Path A's commerce extraction; messaging in node README needs Path A refresh.
- **LAU-285** Make.com custom app — Modules verified. Same as above — distribution stays, copy refreshes.
- **LAU-279** Subscription billing alongside MPP — Stripe-backed tier billing. Per-seat reviewer pricing model will sit on top of this; no need to rebuild.
- **LAU-309** Leaderboard Showcase + Ingest Pipeline (v2) — Phases 1-3.5 shipped; ingest pipeline is the substrate LAU-298 builds on.
- **LAU-304** Free tier full-pipeline 50/mo — IP-throttled playground (`/api/playground`); already the conversion surface Path A's demo will live in.
- **LAU-319 / LAU-320 / LAU-322** — Per-field extraction_method, modifier ledger, playground UI for list values + confidence pills. These are the evidence-rendering primitives the operator-review surface reuses.

## Notes / observations

- **The framing pivot is bigger than ticket-level edits.** Most In-Progress P2 tickets were written between 2026-04-08 and 2026-04-14 with "authenticated extraction proxy" / "fast lanes" / "RFC 9421" as load-bearing positioning. The corrected direction keeps the same underlying tech (confidence, method attribution, escalation) but inverts the customer-facing identity. Every ticket flagged MODIFY needs body rewrites, not just status changes.
- **LAU-296 cancellation has downstream effects.** Several other tickets gate on its activation (LAU-298 access-readiness column, LAU-275 6th dimension, LAU-300 merchant guide). Those references should be removed in the MODIFY pass to prevent ghost dependencies.
- **Discovery research found Pattern E (reviewer correction rate measurement) as a gap nobody fills.** Recommend prioritizing the NEW "reviewer-correction-rate measurement & dashboard" ticket because it's a unique differentiator against HumanLayer's pivot and creates the metric that makes Path A defensible.
- **HumanLayer's per-operation pricing failure is a known constraint.** Any pricing work (LAU-316 rewrite, new pricing page ticket) must adopt per-seat pricing for the reviewer surface; per-operation is explicitly banned in `project-path-a-c-direction.md`.
- **Done work is a strength, not waste.** ~$50K-equivalent of shipped infrastructure (confidence scoring, RFC 9421, UCP, leaderboard ingest, free tier, n8n/Make nodes) becomes the substrate Path A and Path C build on. The pivot is primarily a positioning + ticket-routing exercise, not a code-throwaway.
- **No Linear updates were made.** All changes recommended above require explicit user action — this audit is read-only per task instructions.
