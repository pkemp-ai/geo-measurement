---
description: Phase 2 of the AEO/GEO audit. Reads approved prompts, runs the surfaces under test plus the reputation/content/site audits, classification, metrics, performance grading, and insights staging — then parks findings at Gate 2 in Notion. Take <slug> as $ARGUMENTS. Requires OPENROUTER_API_KEY.
---

# /audit-run

Phase 2. Runs the full audit pipeline for one company and parks findings at Gate 2. **Requires Gate 1 approved (Status: Running) and `OPENROUTER_API_KEY` set.**

## Step 0 — Ground + preconditions

Read `.claude/context/aeo-audit-framework.md`. Confirm `OPENROUTER_API_KEY` is set (`zsh -ic 'echo ${OPENROUTER_API_KEY:+set}'`); if not, STOP and tell the operator. Take `<slug>` from `$ARGUMENTS`.

## Step 1 — Sync approved prompts

Confirm the company's **AEO Audits** row Status = `Running` (Gate 1 approved). Query the **AEO Prompts** DB for `Company = <co>` (via `query_data_sources` on the data source, or `notion-fetch` the data source) and write the rows to `companies/<slug>/prompts.json` — capturing any prompt/criteria edits made in the table. Split each row's `Success criteria` cell on newlines/bullets into the criteria array. If Status is still `Awaiting prompt approval`, STOP.

## Step 2 — Run the surfaces under test

`node run-prompts.mjs <slug>` → `raw_responses.jsonl`. If a surface returns zero citations across the board, flag it (grounding may be off) and surface to the operator before continuing.

## Step 3 — Component audits (parallel)

Spawn in parallel: `audit-reputation-scraper`, `audit-content-auditor`, `audit-site-crawler` for `<slug>`. Each writes its structured JSON.

## Step 4 — Classify + compute (deterministic)

`node classify.mjs <slug>` → `classified.jsonl`, then `node compute-metrics.mjs <slug>` → `metrics.json`.

## Step 5 — Grade + stage

Spawn `audit-performance-grader` → `graded.jsonl`. Then spawn `audit-insights-stager` → `findings.json` **and `deck-overrides.json`** (the deck-ready editorial one-liners for the Canva builder). Lint the latter: `node prose-lint.mjs companies/<slug>/deck-overrides.json`. An em dash fails it (exit 1); if it does, have the stager rewrite the offending line before continuing.

## Step 6 — Write to Notion (Gate 2)

1. **Response Log.** Merge `classified.jsonl` + `graded.jsonl` by `prompt_id + surface` and push one row per prompt × surface to the **AEO Response Log** DB (find-or-create by title under AI Briefings): Response ID (`<co> / <prompt_id> / <surface>`), Company, Prompt ID, Track, Surface, Brand mentioned, Own domain cited, Citations (count), Performance (grader score), Flags, Grader note (rationale excerpt). One `notion-create-pages` call for all rows.
2. **Findings (the Gate 2 artifact).** Create a child page **"Findings — `<Company>` · Gate 2"** under the company's AEO Audits row via `notion-create-pages` (parent = the row's page id): verdict + both scorecards (three axes + diagnosis + key findings each) + the prioritized fix list, from `findings.json`. **Do NOT use `update-page` body commands — they mangle newlines.**
3. Set the AEO Audits row Status → `Awaiting findings approval` (`update_properties`).

## Step 7 — Summary + Gate

Print the verdict + top fixes, and note `deck-overrides.json` is written and linted. STOP. This is Gate 2: approve by setting Status → `Reporting` (which also signs off the deck one-liners), then run `/audit-report <slug>`.

Halt-with-a-question on any exception (surface failure, empty scraper result, entity mismatch) rather than guessing.
