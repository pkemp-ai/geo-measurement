---
description: Phase 1 of the AEO/GEO audit. Gathers public context on a company and defines the discoverability + assessment prompts, then writes them to Notion (AEO Prompts table) for approval (Gate 1). Take "Company domain.com" as $ARGUMENTS.
---

# /audit-prep

Phase 1 of the audit pipeline. Produces the context + proposed prompts for one company and parks them at Gate 1 (operator approval in Notion). Runs NO surface tests — that's `/audit-run`, after you approve the prompts.

## Step 0 — Ground yourself

Read `.claude/context/aeo-audit-framework.md`.

## Step 1 — Parse input

From `$ARGUMENTS`, extract the company name + domain. Derive a slug (kebab-case, e.g. `northwind`). Create `companies/<slug>/` if absent.

## Step 2 — Gather context

Spawn the `audit-context-gatherer` subagent with the company name, domain, and slug. It writes `companies/<slug>/context.md` + `context.json`. If it reports it can't pin the entity, STOP and surface to the operator. (If the agent isn't loaded as a subagent yet — newly added files need a session reload — do the work inline per that agent's spec.)

## Step 3 — Define prompts

Spawn the `audit-prompt-definer` subagent for the slug. It reads context.md and writes `companies/<slug>/prompts.json`: discoverability + assessment prompts, each with structured success criteria (`id` / `text` / `weight` / `kill`) that become the grading rubric, per-prompt `runs`, and the comparison prompts tagged `is_comparison` + `named_rival` for the head-to-head metric. The context gatherer also sets `audit_profile` in context.json (the company archetype: plg_saas, enterprise_b2b, dev_tool, crypto_infra, consumer, services) — it gates which scoring elements apply. Same inline fallback applies.

## Step 4 — Write to Notion (Gate 1)

Two databases live under your Notion workspace (find-or-create each by title via `notion-search`):
- **AEO Audits** — `Company` (title), `Domain` (text), `Status` (select: Prep, Awaiting prompt approval, Running, Awaiting findings approval, Reporting, Published), `Audit Date` (date), `Report URL` (url). One row per company.
- **AEO Prompts** — the single Gate-1 table, **one row per (prompt × criterion)**. Prompt-level columns repeat across a prompt's rows; criterion-level columns are unique per row: `Prompt ID` (title, repeats), `Company` (select), `Track` (select: discoverability, assessment), `Prompt` (text), `Runs` (number), `Rationale` (text), `Is comparison` (checkbox), `Named rival` (text), `Criterion ID` (text, `<prompt-id>.c<n>`), `Criterion` (text), `Weight` (number), `Kill` (checkbox). The operator reviews and edits both the prompts and the grading rubric here, one criterion per row. (The separate AEO Criteria table is retired, folded in here.)

Then:
1. Create/update the company's **AEO Audits** row: Company, Domain, Status = `Awaiting prompt approval`, Audit Date = today. Body = a short context summary (entity, what it does, ICP, category terms, competitive set, positioning, pricing — distilled from context.md) for grounding.
2. Write the prompts + rubric as **AEO Prompts** rows: for each prompt in prompts.json, emit one row per `success_criteria[]` entry — prompt-level columns (Company = `<co>`, Track, Prompt, Runs, Rationale, Is comparison, Named rival) repeated on each of that prompt's rows; criterion columns (Criterion ID, Criterion, Weight, Kill) unique per row. `Is comparison` + `Named rival` are set on the head-to-head / alternatives prompt (blank elsewhere; `/audit-run` reads these back into `is_comparison`/`named_rival`). **This single table is where the operator edits both the prompts (run counts, wording) and the grading rubric (criterion text, weight, kill).**

Use `notion-create-pages` for all body/row content — it renders multi-line cleanly. **Do NOT use the `update-page` `replace_content` / `insert_content` commands for multi-line body content — they mangle newlines into literal "n".** (`update_content` search-replace and `update_properties` are safe.)

## Step 5 — Summary + Gate

```
✓ Prep complete — <Company>
  Entity:  <descriptor>
  Context: companies/<slug>/context.md
  Prompts: 6 (3 discoverability + 3 assessment) → AEO Prompts table
  Notion:  <audit row url>   (Status: Awaiting prompt approval)

Review/edit the prompts in the AEO Prompts table (filter Company = <Company>).
When they look right, set the AEO Audits row Status → Running, then run /audit-run <slug>.
```

STOP here. This is Gate 1 — do not proceed to the run phase automatically.
