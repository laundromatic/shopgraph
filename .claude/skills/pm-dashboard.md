---
name: pm-dashboard
description: Full ShopGraph PM dashboard. Comprehensive on-demand view with scoreboard, pipeline breakdown, dependency chains, priority analysis, stale issues, and strategic recommendations.
user_invocable: true
---

# ShopGraph PM Dashboard — Full Analytical View

Run a comprehensive program manager dashboard for ShopGraph issues in Linear.

## Instructions

1. **Get all ShopGraph issues** from the SpinOuts project (ID: `52fb78a7-28c7-4d93-9973-00477f8d1337`) using `mcp__linear__linear_getProjectIssues` with limit 100. Use the Agent tool to process the large result file — delegate the full read and analysis to a subagent.

2. **Filter to ShopGraph only** — include issues with "ShopGraph" in the title, plus these known ShopGraph tickets: LAU-251, LAU-259, LAU-265, LAU-273, LAU-274, LAU-275, LAU-277, LAU-279, LAU-280, LAU-281, LAU-282, LAU-283, LAU-285, LAU-287, LAU-288, LAU-289, LAU-290, LAU-293, LAU-296, LAU-297, LAU-298, LAU-299, LAU-300. Exclude SceneInBloom, Atlas, kb.computer, TrustKit, TrustMem, veryboringui, and portfolio-only tickets.

3. **Report ALL of these sections:**

### Scoreboard
| Metric | Value |
|--------|-------|
| Total ShopGraph issues | N |
| Done | N (%) |
| In Progress | N (%) |
| Backlog | N (%) |
| Blocked | N |
| Urgent (P1) | N |

### Urgent / Due Soon
Table of P1 issues and anything due within 14 days. Include: ID, title, due date, status, what's blocking completion.

### In Progress Detail
For each in-progress issue: ID, title, what shipped, what remains, last updated date. Pull from description AND comments for latest status.

### Epic / Parent Progress
For each epic or parent issue (LAU-256, LAU-262, LAU-282):
- Child issue count and completion %
- Which children are done / in progress / backlog
- Critical path through the epic

### Dependency Chain Analysis
Map the critical dependency chains. Identify:
- What's blocking the most downstream work
- What's unblocked and ready to start
- Circular or stale dependencies

### Stale Issues (7+ days)
In-progress issues not updated in 7+ days. Include last update date and recommendation (close out, move to backlog, or prioritize).

### Pipeline by Area
Group issues by area:
- **Core Engine** (extraction, confidence, self-healing)
- **Billing & Auth** (Stripe, API keys, tiers)
- **Identity & Access** (RFC 9421, registries, access readiness)
- **Website & Design** (shopgraph.dev, SEO, landing page)
- **Distribution** (framework PRs, n8n node, Make app, registries)
- **Outreach** (blog, social, Stripe email, Show HN)

Show count and status breakdown per area.

### Priority Distribution
Count by priority level. Flag if >50% of issues are High — recommend triage.

### Observations & Recommendations
- Top 3 things to do this week (based on priority, dependencies, and leverage)
- Risks or concerns (scope creep, stale work, missing deadlines)
- Issues that should be re-prioritized
- Housekeeping recommendations (close stale tickets, update statuses)

## Output Format

Use tables for data, bullet points for analysis. This is the comprehensive view — be thorough but structured. Group related information visually.
