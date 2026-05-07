# ShopGraph Growth Agent — Task Spec

**Task name:** `shopgraph-growth-agent-weekly-thursday-9am`
**Schedule:** Weekly, Thursday 9am
**Scope:** GitHub, npm, MCP directories (Glama / Smithery / mcp.so / awesome-mcp-servers), Reddit, HN, Dev.to
**Goal:** 10 candidate users or advocates + outreach drafts for the top 5

---

## Step 0 — Read the Briefing

Fetch `https://shopgraph.dev/briefing.md` and read it before doing any research.
This is the canonical context file for all Laundromatic projects. It contains
positioning, competitive landscape, active tickets, and working-style preferences.

If the URL returns a non-200 response, stop and report the failure. Do not
proceed with a stale cached version.

---

## Step 1 — Read Prior Reports

Read the four most recent growth reports from
`~/Documents/Claude/Projects/Spin Offs/` (sorted by date descending).
Extract:
- Every person or project that appeared in any top-10 list → add to **skip list**
- Every person contacted or drafted for → add to **skip list**
- Any open follow-up items flagged for this week → note them explicitly in output

---

## Step 2 — GitHub Search

Query `api.github.com/search/repositories` directly (not via a subagent that
fetches github.com/search HTML). Use JSON responses with sort=updated.

Suggested queries (run all; adjust keywords if they return low signal):
- `q=agentic+commerce+mcp&sort=updated`
- `q=ucp+shopify+agent&sort=updated`
- `q=product+data+mcp+server&sort=updated`
- `q=ecommerce+structured+data+agent&sort=updated`
- `q=shopping+agent+typescript&sort=updated`

For each repo returned with stars ≥ 3 and pushed within 60 days:
1. Call `api.github.com/repos/{owner}/{repo}` — confirm HTTP 200, record `pushed_at`
2. Read `description` and `topics` to assess relevance
3. Note the owner — check if they have other related repos

---

## Step 3 — npm Ecosystem

Search the npm registry for packages in the agent-commerce / MCP space.

Suggested searches:
- `registry.npmjs.org/-/v1/search?text=mcp+ecommerce`
- `registry.npmjs.org/-/v1/search?text=mcp+product+data`
- `registry.npmjs.org/-/v1/search?text=shopping+agent+sdk`

For each package of interest:
1. Fetch `registry.npmjs.org/{package}` directly
2. Read the `repository.url` field — use this as the GitHub URL, do not infer it
3. Verify the GitHub URL passes Rule A (HTTP 200 from GitHub API)
4. Note weekly download count and last publish date

---

## Step 4 — MCP Directory Scan

Check these sources for new entries in the agent-commerce / product-data category:

- `glama.ai` — scan the ecommerce-and-retail category page
- `awesome-mcp-servers` (GitHub README) — search for ecommerce/commerce/product entries
- `smithery.ai` — check for new ecommerce MCP servers
- `mcp.so` — check for new ecommerce listings

Note any new direct competitors to ShopGraph (arbitrary-URL structured-product extraction).
Note ShopGraph's own listing status on each directory.

---

## Step 5 — Community Scan

Search these sources for people actively discussing agent commerce:

- HN Algolia API: `hn.algolia.com/api/v1/search?query=mcp+ecommerce&tags=story`
- HN Algolia API: `hn.algolia.com/api/v1/search?query=shopping+agent+api`
- Reddit: search r/ClaudeAI, r/LocalLLaMA, r/SideProject for recent ecommerce/MCP posts
- Dev.to: search for posts tagged mcp, ecommerce, agentic-commerce

For each person surfaced, check whether they are on the skip list before including.

---

## Step 6 — Produce Top 10 Candidates

Rank by signal strength. For each candidate include:

```
### N. [Name / Project] — [CONFIDENCE: HIGH | MEDIUM | LOW]

- **Where found:** [source URL]
- **Verified via:** [api.github.com (direct) | registry.npmjs.org (direct) | hn.algolia.com (direct) | fetched manually]
- **pushed_at / last active:** [date from API response]
- **What they're building:** [1-2 sentences]
- **ShopGraph angle:** [why they are a user or advocate candidate]
- **Contact:** [GitHub, email, HN handle, etc.]
```

Confidence definitions:
- **HIGH** — you called the primary API directly this run and got a 200
- **MEDIUM** — sourced from a directory or aggregator; primary API not called
- **LOW** — subagent or secondary source only; flag explicitly

Top-10 entries must be HIGH confidence. MEDIUM and LOW entries go in an
"Honorable Mentions / Tracking" section below the top 10.

---

## Step 7 — Top 5 Outreach Drafts

For the top 5 candidates, write an outreach message:
- Under 150 words
- Problem-first opener — no "I noticed you might benefit from..." framing
- No marketing copy or superlatives
- Written as if from a real person, not a company
- Match the channel to the target (email, GitHub issue, HN comment, DM)

---

## Step 8 — MCP Directory Landscape Delta

Brief section on what changed in the competitive directory landscape vs. last week:
- New direct competitors (arbitrary-URL structured-product extraction)
- ShopGraph listing status changes
- Any new categories or trends worth tracking

---

## Step 9 — Follow-up Items

List any items flagged for next week's run or for manual action by Krishna.

---

## Step 10 — Compliance Check

Close with a compliance block:

```
## Compliance check

- **Read briefing:** [yes — shopgraph.dev/briefing returned 200 | FAIL — {reason}]
- **Prior reports read:** [yes — {dates}]
- **Skip list applied:** [yes — {N} names excluded]
- **10 candidates returned:** [yes | no — {reason}]
- **Top-10 all HIGH confidence:** [yes | no — {exceptions}]
- **Top-5 outreach drafts:** [yes]
- **File saved to project:** [yes — {path}]
```

---

## Output

Save the report to:
`~/Documents/Claude/Projects/Spin Offs/shopgraph-growth-report-{YYYY-MM-DD}.md`

---

## Verification Rules

These rules are hard constraints. Violations cause the report to be unreliable.

### RULE A — GitHub verification before inclusion
Every GitHub repository cited in the top-10 list MUST be verified by a direct
call to `api.github.com/repos/{owner}/{repo}` that returns HTTP 200. Quote
the `pushed_at` date in the candidate entry. If the API returns 404, the
candidate is **dropped entirely** — do not demote it to a lower confidence
tier or note it as unverified.

### RULE B — npm-to-GitHub linking via registry, not inference
When sourcing leads from npm, the GitHub URL MUST come from the `repository.url`
field in `registry.npmjs.org/{package}` — not inferred from the package name,
author name, or naming patterns. That URL must then pass Rule A. If the npm
registry response has no `repository` field, list the package without a GitHub
URL. Do not guess one.

### RULE C — No GitHub search HTML subagent
Do not dispatch a subagent to fetch `github.com/search` HTML pages. That
endpoint rate-limits and returns no reliable structured data. Instead, call
`api.github.com/search/repositories?q=...&sort=updated` directly from the
parent task. Parse the JSON response for repo names, `pushed_at` dates, and
star counts.

### RULE D — Skip lists are absolute
If a name (GitHub handle, npm package, HN username) appears in the prior-weeks
skip list, it is excluded unconditionally — regardless of signal strength.
Subagents that surface a skip-listed name should have their entire result set
flagged as low-confidence and re-verified before any item from that subagent
is promoted to the top 10.

### RULE E — Verification source required in top 10
Every entry in the top-10 list must include a `verified via` line. Acceptable
sources: `api.github.com (direct)`, `registry.npmjs.org (direct)`,
`hn.algolia.com (direct)`, `fetched manually`. Subagent-only sourcing is not
acceptable for top-10 entries. Any candidate that can only be sourced from a
subagent goes to the Honorable Mentions section.
