---
description: Phase 2 of the AEO/GEO audit. Reads approved prompts + criteria, runs the surfaces under test, gathers the evidence ledgers, classifies + grades (judge-then-score), scores the four levers with the importance layer, and stages findings — then parks everything at Gate 2. Take <slug> as $ARGUMENTS. Requires OPENROUTER_API_KEY.
---

# /audit-run

Phase 2. Runs the full audit pipeline for one company and parks findings at Gate 2. **Requires Gate 1 approved and `OPENROUTER_API_KEY` set.**

## Step 0 — Ground + preconditions

Read `.claude/context/aeo-audit-framework.md`. Confirm `OPENROUTER_API_KEY` is set; if not, STOP and tell the operator. Take `<slug>` from `$ARGUMENTS`.

## Step 1 — Sync approved prompts

Pull the operator-approved prompts + per-criterion rubric (id / text / weight / kill, per-prompt `runs`, and the comparison tags `is_comparison`/`named_rival` that drive the head-to-head win/tie/loss verdict) into `companies/<slug>/prompts.json`. In the production system these live in Notion tables the operator edits at Gate 1; locally, editing prompts.json directly is equivalent. If Gate 1 isn't approved, STOP.

## Step 2 — Run the surfaces under test

`node run-prompts.mjs <slug>` → `raw_responses.jsonl`, one row per prompt x surface x run (per-prompt `runs`, defaults 3 discoverability / 2 assessment; failed calls retry once then land as `status:"error"` rows so denominators stay honest). If a surface returns zero citations across the board, flag it (grounding may be off) before continuing.

## Step 3 — Evidence ledgers (parallel, freeze-then-score)

Deterministic checks first:
- `node access-checks.mjs <slug>` → `access.json` (robots rules per AI-bot class, live UA probes, Bing/Brave index presence).
- `node site-checks.mjs <slug>` → `site-facts.json` (frozen page sample + scripted onsite facts: fetchability, crawl coverage, schema, freshness, FAQ/pricing presence, structure excerpts).

Then spawn in parallel: `audit-offsite-evidence` and `audit-onsite-evidence` for `<slug>`. Each writes a facts ledger (`offsite-facts.json`, `onsite-facts.json`) — facts with URLs and dates, never scores.

## Step 4 — Classify + grade (judge-then-score)

1. `node classify.mjs <slug>` → `classified.jsonl` + `consideration.json` (mention/citation tagging, the citation-role taxonomy, and the answer-derived, category-gated consideration set that feeds share-of-voice).
2. Spawn `audit-performance-grader` → `verdicts.jsonl` (one pass/partial/fail verdict per approved criterion, verbatim quote, confidence — never a number).
3. `node grade-compute.mjs <slug> --judge "<model>"` → `graded.jsonl` + `review-queue.json` (validates every quote against the response, applies the floor gate, computes each Performance Score in code; unsure/invalid verdicts queue for Gate 2).
4. `node compute-metrics.mjs <slug>` → `metrics.json` (mention/citation per track + surface, per-prompt k/n counts, blended_avg + portrayal_when_named, criterion failure rates, share-of-voice).

## Step 5 — Score, decide the fixes, stage

Scoring and the reasoning about what to fix are split, so reproducible scoring stays separate from judgment:

1. `node score-elements.mjs <slug>` → `levers.json`: the four levers (Access / Identity / Content / Reputation) scored across ~28 elements (mechanical checks in code; judged elements by a pinned judge at temp 0 against anchored rubrics, evidence quotes validated). It scores; it doesn't decide what matters.
2. `node score-importance.mjs <slug>` → `importance.json` (+ merged back into `levers.json`): blends the evidence-tier prior with this run's observed citation signal, then ranks every gap by importance x (5 − score). Reproducible, no LLM calls. (`node score-levers.mjs <slug>` is a back-compat shim that runs both stages.)
3. Spawn `audit-fix-brief` → `fix-context.md`: a run-aware strategy brief fusing the brand's positioning with this run's findings (which job is broken, where the leverage is, who owns the category) so the strategist reasons from the real situation.
4. Spawn `audit-fix-strategist` → `fixes.json`: the reasoning step that **determines** the fixes — bespoke, re-ranked, with named targets pulled from the evidence ledgers. It may override the importance ranking with stated reasons.
5. Spawn `audit-insights-stager` → `findings.json` + `deck-overrides.json` (verdict, two scorecards, and the prioritized fix list **phrased from** the strategist's fixes, plus the deck-ready editorial lines). Lint: `node prose-lint.mjs companies/<slug>/deck-overrides.json` — an em dash fails it (exit 1); have the stager rewrite the offending line.
6. `node build-findings.mjs <slug>` → `findings.md`: a deterministic stitch of the run's artifacts into one human-readable Gate 2 review doc. (`build-audit-log.mjs` builds the per-element rows for the optional Notion Audit Log.)

## Step 6 — Gate 2

Present the verdict, the two scorecards, the lever scores, the priority ranking, the review queue count, and anything in `verify_first` (indeterminate checks that must not be prescribed). In the production system this is parked in Notion for approval; locally, the operator reviews `findings.json` + `review-queue.json`. To adjudicate a grading call: edit `verdicts.jsonl`, re-run `grade-compute.mjs` + `compute-metrics.mjs` (deterministic, free).

STOP. This is Gate 2. Approve, then run `/audit-report <slug>`.

Halt-with-a-question on any exception (surface failure, empty ledger, entity mismatch) rather than guessing.
