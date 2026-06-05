# AEO/GEO Audit System

An agentic system that audits how AI search — ChatGPT, Perplexity, Claude — **discovers, names, and describes a company**, then ships a client-ready report.

Built by [Lobo Growth](https://lobogrowth.com). This repo is a public showcase of the architecture: the LLM judgment agents, the deterministic measurement harness, and a fully worked **synthetic example** (`companies/northwind/`) so you can see real inputs and outputs without any client data.

> **Why this exists.** "SEO for AI" (AEO = Answer Engine Optimization, GEO = Generative Engine Optimization) is mostly vibes and vanity metrics. This system makes it measurable: it runs real prompts against real answer engines, grades each answer against the brand's own positioning, and separates two failure modes most tools blur together.

![Agent system](agent-system-preview.png)

## The one idea: two jobs, never averaged

A company can fail AI search in two distinct ways, and the fix for each is different:

| Job | Question it answers | "Broken" looks like |
|-----|--------------------|--------------------|
| **Discoverability** | When a buyer asks a *category* question ("best stablecoin payouts API?"), is the company **named** at all? | Competitors fill the answer; the company isn't in the room. |
| **Assessment** | When a buyer asks about the company **by name**, is it described **accurately and favorably**? | Wrong entity, stale facts, miscategorized, hallucinated products. |

The scores are reported **separately and never averaged** — averaging hides which job is broken, and the report leads with that verdict. The wedge metric is a per-answer **Performance Score**: each model answer is graded against the brand's *own* positioning and the prompt's success criteria, not a generic rubric.

See [`.claude/context/aeo-audit-framework.md`](.claude/context/aeo-audit-framework.md) for the full methodology.

## How it runs — 3 phases, 2 human gates

Each phase is a slash command (`.claude/commands/`) that orchestrates agents and then **stops at a gate** for human review. Nothing auto-advances.

```
/audit-prep  <Company> <domain>   research + pin entity + draft test prompts   ── Gate 1: approve prompts
/audit-run   <slug>               query 3 surfaces + 3 audits + grade          ── Gate 2: approve findings
/audit-report <slug>              compile the client report
/audit-publish <slug>             (deployment-specific) push report live
```

## Architecture

**Deterministic harness** (Node, native `fetch`, zero dependencies) — the parts that must be reproducible:

| File | Role |
|------|------|
| `run-prompts.mjs` + `lib/surfaces.mjs`, `lib/openrouter.mjs` | Query Claude, Perplexity, and ChatGPT via OpenRouter (web search on, 1-shot) → `raw_responses.jsonl` |
| `classify.mjs` | Tag each answer: brand mentioned? own domain cited? competitors present? source types? → `classified.jsonl` |
| `compute-metrics.mjs` | Mention/citation rates, share-of-voice, top cited domains → `metrics.json` |
| `prose-lint.mjs` | High-precision AI-writing-tell linter; hard-fails on em dashes |

**LLM judgment agents** (`.claude/agents/`) — the parts that need reasoning:

| Agent | Job |
|-------|-----|
| `audit-context-gatherer` | Research the company, pin the exact entity, write `context.md` |
| `audit-prompt-definer` | Draft the discoverability + assessment test prompts (Gate 1 artifact) |
| `audit-reputation-scraper` | What third parties say (Reddit, reviews, Wikipedia, press, listicles) |
| `audit-content-auditor` | What the brand publishes that could earn citations |
| `audit-site-crawler` | On-site hygiene for the assessment job (schema, claims, fetchability, `llms.txt`) |
| `audit-performance-grader` | **The wedge** — grades each answer against the brand's positioning |
| `audit-insights-stager` | Synthesizes everything into two scorecards + a prioritized fix list (Gate 2) |
| `audit-report-writer` | Writes the client-facing HTML report, led by the verdict |

The split is deliberate: anything that should be reproducible and cheap is a deterministic script; anything that needs judgment is an agent grounded by a shared methodology file.

## The worked example — `companies/northwind/`

A complete audit of a **fictional** company, **Northwind Pay** (a stablecoin payments API). Every number, finding, and quote is synthetic — see the banner in `companies/northwind/context.md`. Real companies appear only as market-context competitors.

Open [`companies/northwind/report.html`](companies/northwind/report.html) in a browser for the final deliverable. The verdict it lands on: **discoverability is broken, assessment is strong** — Northwind is described accurately when asked by name (4.3/5, named in 100% of answers) but barely surfaces in category questions (1.7/5, named in 3 of 9). The supporting artifacts (`prompts.json`, `raw_responses.jsonl`, `classified.jsonl`, `graded.jsonl`, `metrics.json`, `findings.json`, …) show every step that produced it.

## Running it yourself

The agents and commands are designed for [Claude Code](https://claude.com/claude-code). The harness scripts run with plain Node.

```bash
cp .env.example .env          # add your OpenRouter key
npm run test:surfaces         # re-queries the surfaces for the example slug
node classify.mjs northwind
node compute-metrics.mjs northwind
```

The `/audit-publish` phase is wired to one specific deployment (Canva + Netlify + a custom host) and is included as a documented stub — phases 1–3 produce all the analysis and a self-contained `report.html`.

## License

MIT — see [LICENSE](LICENSE). Built by Patrick Kemp / [Lobo Growth](https://lobogrowth.com).
