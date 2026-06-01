# Calibration Activation Runbook

**Status:** Aspirational → Activation in progress. See verification doc
`/Users/krishnabrown/Documents/Claude/Projects/discovery-research/calibration-state-verification-2026-05-31.md`
for the gap analysis that prompted this work.

**Related Linear:** LAU-287 (confidence scoring, parent), this ticket (activation).

## What "calibration" means in ShopGraph

`src/calibration.ts:generateCalibrationReport()` is the source of truth.
The function reads stored `BatchResult` records from Redis (keys matching
`results:*`), pulls per-field `confidence` scores and per-field `accurate`
booleans from either `llm_validation.fields_verified` or
`ground_truth_match`, and computes:

- Per-field calibration buckets (`[0, 0.5]`, `[0.5, 0.7]`, `[0.7, 0.85]`,
  `[0.85, 1.0]`) showing how the reported confidence in each bucket
  compares to actual accuracy.
- Per-field Pearson R between confidence and accuracy.
- Overall Pearson R across all field samples.
- A recommendation:
  - `well_calibrated` — overall Pearson R > 0.70
  - `needs_adjustment` — sample size >= 30 but R <= 0.70
  - `insufficient_data` — sample size < 30 (or < 10 minimum to even attempt)

The report is persisted to `redis.set('stats:calibration', report)` and
served read-only at `GET /api/stats/calibration`.

## Why we have no calibration data today (verified 2026-05-31)

Three independent gaps, all required to produce a usable report:

1. **`ENABLE_LLM_VALIDATION` is unset in production.** `src/test-runner.ts:164`
   gates the LLM validator (`validateExtraction` → Gemini 2.5 Flash) on
   this env var. Without it, no extraction batch ever populates
   `field_results.llm_validation`. Result: `generateCalibrationReport`
   sees zero validation samples and returns `insufficient_data`
   (`src/calibration.ts:130-141`).

2. **No cron schedule for `/api/run-calibration`.** Even when validation
   data exists, the report is only generated on manual trigger. The
   endpoint exists at `api/index.ts` (POST + new GET) but is not in
   `vercel.json` crons — until this change.

3. **Only 30 of 208 corpus entries have ground truth labels.**
   `data/test-corpus.json` has 208 URLs but only 30 carry a
   `ground_truth` block. Ground truth provides a free signal for
   calibration without LLM cost; the 178 unlabeled URLs depend entirely
   on the LLM validator (which is currently off).

## Activation sequence

Each step is independently safe and reversible.

### Step 1 — Turn on the validator in production (REQUIRES KB)

Set in Vercel production environment (dashboard or `vercel env`):

```
ENABLE_LLM_VALIDATION=true
```

Side effects once live:

- Each batch of `BATCH_SIZE=6` extractions in `runTestBatch()` will run
  the LLM validator on the **first 3 successful extractions only**
  (`VALIDATION_SAMPLE_SIZE = 3`, `src/test-runner.ts:55`). This is a
  hard per-batch cost ceiling.
- Validator model: `gemini-2.5-flash` with `15_000` chars of cleaned
  page text + small JSON of extracted fields. One call per validated
  extraction.

**Cost estimate** (rough — assumes current `/api/run-tests` cron schedule
`0 * * * *` = hourly):
- 24 batches/day × 3 validations/batch = **72 Gemini Flash calls/day**.
- Gemini 2.5 Flash list pricing (input-heavy): ~$0.30/1M input tokens,
  ~$2.50/1M output tokens. Each call ~5k input tokens + ~500 output.
- Per call ≈ $0.30 × (5000/1e6) + $2.50 × (500/1e6) = ~$0.0028.
- Daily ≈ 72 × $0.0028 = **~$0.20/day**, ~$6/month. Negligible.

**Validation:** After enabling, wait one hourly cron cycle, then check
`GET /api/stats/calibration` — `sample_size` should start incrementing
once Redis accumulates `results:*` records carrying `llm_validation`.

### Step 2 — Schedule the calibration cron (DONE in this change, NOT YET DEPLOYED)

This change adds to `vercel.json`:

```json
{ "path": "/api/run-calibration", "schedule": "0 4 * * *" }
```

Daily at 04:00 UTC. Cost: 30 executions/month — well under the 10,000
n8n-style execution budget noted in `CLAUDE.md` (this is a Vercel cron
on a different budget anyway).

The endpoint is `GET` (Vercel cron daemon issues GET) and requires
`Bearer CRON_SECRET` to match the existing cron auth pattern used by
`/api/run-tests`, `/api/leaderboard/rescore`, and
`/api/admin/stats-digest`. The pre-existing `POST` handler is kept for
manual triggering.

Cost of the report itself: one Redis `SCAN results:* COUNT 100` loop
plus N `GET`s. No LLM calls. Bounded by the size of the `results:*`
keyspace.

### Step 3 — Grow the ground-truth corpus (BACKLOG, REQUIRES HUMAN)

178 URLs in `data/test-corpus.json` lack a `ground_truth` block. Adding
them gives calibration a deterministic signal that doesn't depend on
the LLM validator agreeing with itself.

Labeling a single URL means visiting the page and recording, at
minimum, `product_name`, `brand`, `price_amount`, `price_currency` for
the matching schema used in the 30 existing entries.

**Effort estimate:**
- ~3-5 minutes per URL at a careful pace (visit, copy 4 fields, format
  JSON, verify against existing pattern).
- One-shot: 178 × 4 min ≈ **~12 hours of focused human time** — roughly
  1.5 working days for a single operator.
- Trickle pattern: **5 URLs/day** = ~36 days; **10 URLs/day** =
  ~18 days. Fits a daily operator-queue cadence without becoming the
  whole job.

Not something a sub-agent can do unsupervised — page content can be
ambiguous (variant pricing, "from $X" patterns, bundled SKUs), and
mistakes here corrupt the very metric calibration is meant to measure.

## What "calibrated" means once active

Continuously: each daily 04:00 UTC run rebuilds `stats:calibration`
from whatever extractions accumulated in the prior 24 hours plus all
historical results still in Redis.

- `sample_size < 10` → `insufficient_data` (report bails early)
- `sample_size 10-29` → `insufficient_data` (computed but flagged)
- `sample_size >= 30 && overall_pearson_r > 0.70` → `well_calibrated`
- `sample_size >= 30 && overall_pearson_r <= 0.70` → `needs_adjustment`

The dashboard / leaderboard pages that today claim "continuous
calibration" become true once `sample_size` is sustained above 30 and
Pearson R is reported live. Until then, those pages are overstatements
— flagged separately to KB; do not modify copy as part of this ticket.

## Rollback

Each step has an independent off-switch:

- **Step 1 (validator):** Unset `ENABLE_LLM_VALIDATION` in Vercel
  production env, or set to anything other than the string `"true"`.
  The strict equality check at `src/test-runner.ts:164` immediately
  stops new validations on the next deploy / cron tick. Existing
  validation data in Redis is unaffected.
- **Step 2 (cron):** Remove the `{ "path": "/api/run-calibration", ... }`
  entry from `vercel.json` and redeploy. The endpoint remains
  available for manual triggering. Existing `stats:calibration` value
  in Redis is unaffected until the next manual run overwrites it.
- **Step 3 (ground truth):** Revertible via git on `data/test-corpus.json`.
  Removed labels stop contributing to subsequent reports but do not
  affect historical Redis results.

## What this ticket completed vs. what needs KB

Completed (in working tree, **not pushed**, **not deployed**):
- `vercel.json` — added daily 04:00 UTC cron entry for
  `/api/run-calibration`.
- `api/index.ts` — added `GET /api/run-calibration` handler (mirrors
  existing POST, matches cron auth pattern).
- `docs/calibration-activation.md` — this runbook.
- Linear ticket created tracking the activation work.

Requires KB authorization:
- Setting `ENABLE_LLM_VALIDATION=true` in the Vercel **production**
  environment (dashboard or `vercel env add`).
- Reviewing and merging the working-tree changes.
- Deploying to production.
- Decision on the 178-URL labeling backlog: full sprint vs. operator
  trickle vs. defer.
- Separately: deciding whether site copy claiming "continuous
  calibration" should be revised until activation completes.
