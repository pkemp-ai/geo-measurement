# CLAUDE.md — AEO/GEO Audit System

Guidance for working in this repo with Claude Code. Full methodology lives in
`.claude/context/aeo-audit-framework.md`; read it before doing audit work.

## What it does

Audits how AI search (ChatGPT, Perplexity, Claude) discovers, names, and
describes a company, then ships a client report. Two jobs, scored separately and
**never averaged**: **Discoverability** (named in category answers?) and
**Assessment** (described accurately when asked by name?). The report leads with
which one is broken.

## Run it — 3 commands, 2 gates

- `/audit-prep <Company> <domain>` → research + pin entity + draft prompts → **Gate 1** (approve prompts)
- `/audit-run <slug>` → query 3 surfaces + reputation/content/site audits + classify + grade → **Gate 2** (review findings)
- `/audit-report <slug>` → client report

Each command stops at its gate; nothing auto-advances.

## Layout

- `run-prompts.mjs` (surface tester) · `classify.mjs` · `compute-metrics.mjs` ·
  `prose-lint.mjs` · `lib/{surfaces,openrouter}.mjs` — deterministic harness
  (Node, native `fetch`, no deps).
- `companies/<slug>/` — per-company data. The repo ships only the synthetic
  `northwind/` example; real client runs are gitignored.
- `.claude/agents/audit-*` — the 8 LLM judgment agents ·
  `.claude/commands/audit-*` — the phase commands ·
  `.claude/context/` — framework (methodology) + deck-style (report visual system).

## Prereqs

- `OPENROUTER_API_KEY` in `.env` (see `.env.example`) — surface queries run
  Claude + Perplexity + ChatGPT via OpenRouter, web search on, 1-shot.
- A Notion workspace is optional: the production system parks the two gates
  there, but the audit runs end to end on local files without it.

## Notes

- Never average the two tracks. The wedge is the per-answer Performance Score,
  graded against the brand's own positioning.
- Brand disambiguation: prep pins the entity on the domain and halts if it
  can't; collision-prone names use "the company X" phrasing — a wrong-entity
  answer is a finding, not a bug.
- `companies/northwind/` is a fully synthetic example. Every figure is invented.
