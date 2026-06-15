# AEO/GEO Audit System

An agentic system that measures and improves how AI search — ChatGPT, Perplexity, Claude — **discovers, names, and describes a company**, then ships a client-ready report.

Built by [Lobo Growth](https://lobogrowth.com). This repo is a public showcase of the architecture: the LLM judgment agents, the deterministic measurement harness, and a fully worked **synthetic example** (`companies/northwind/`) so you can see real inputs and outputs without any client data.

> **Why this exists.** "SEO for AI" (AEO = Answer Engine Optimization, GEO = Generative Engine Optimization) is mostly vibes and vanity metrics. This system makes it measurable: it runs real prompts against real answer engines, grades each answer against the brand's own positioning, and separates two failure modes most tools blur together.

![Agent system](agent-system-preview.png)

## What it does

1. **Measures** how LLMs represent a company in the prompts its buyers actually use.
2. **Audits** that company's online presence on the dimensions that influence those answers.
3. **Recommends** the high-leverage fixes, reasoned from the measurement + audit results.

It runs as three Claude Code orchestrators, each executing a fixed sequence of sub-agents, deterministic scripts, and human-operator approval gates.

## Design principles

What separates this from off-the-shelf AEO tools:

- **Discovery and Assessment are separated.** Category (unbranded) and branded prompts have different improvement levers and map to different buyer stages. Most tools average them together; this one never does.
- **A Performance Score, not just mention rate.** Each answer is graded against per-prompt success criteria — *quality* of the portrayal, not merely whether the name appeared.
- **The audit is quantitative.** The company is scored 0–5 on 28+ dimensions against written rubrics, where most audits are qualitative assessments that need a human to interpret.
- **Every score is reproducible.** Systems that lean on free-form AI judgment drift run-to-run on the same inputs. Here, agents *judge* (pass/partial/fail with a verbatim quote) and code *scores* — so the arithmetic is deterministic.
- **Improvement is the point.** A purpose-built reasoning agent recommends bespoke, high-leverage fixes. Most systems stop at the results and leave the "so what" to a human.

## The one idea: two jobs, never averaged

A company can fail AI search in two distinct ways, and the fix for each is different:

| Job | Question it answers | "Broken" looks like |
|-----|--------------------|--------------------|
| **Discoverability** | When a buyer asks a *category* question ("best stablecoin payouts API?"), is the company **named** at all? | Competitors fill the answer; the company isn't in the room. |
| **Assessment** | When a buyer asks about the company **by name**, is it described **accurately and favorably**? | Wrong entity, stale facts, miscategorized, hallucinated products. |

The scores are reported **separately and never averaged** — averaging hides which job is broken, and the report leads with that verdict. The wedge metric is a per-answer **Performance Score**: each model answer is graded against the brand's *own* positioning and the prompt's success criteria, not a generic rubric.

## Four levers, scored and ranked

The jobs are outcomes; everything a company can fix sorts into four mechanism-ordered levers — before AI can recommend you, it has to **read you, know you, quote you, and hear others vouch for you**:

| Lever | Question | Owner |
|-------|----------|-------|
| **Access** | Can a machine read you? (bot access, raw-HTML fetchability, the Bing/Brave indexes that gate ChatGPT/Claude search) | Eng |
| **Identity** | Does AI know who you are? (canonical company/offering pages, entity schema, name binding, Wikipedia) | Brand |
| **Content** | Are you a source worth quoting? (original research, category guides, comparison pages, freshness) | Content |
| **Reputation** | Do trusted third parties vouch for you? (earned press, the roundups AI actually cites, validation sources) | PR |

~28 elements with written 0–5 anchor ladders (`lib/rubric.mjs`), gated by a company-archetype profile (enterprise B2B is not judged like PLG SaaS; inapplicable elements are N/A, never zeroed). Three rules keep the numbers defensible:

- **Freeze-then-score.** Evidence gathering writes facts ledgers (every fact carries a URL and check date, never a score); scoring is a separate deterministic pass over the frozen ledgers — mechanical in code where possible, judged at temperature 0 against the anchors where not, with evidence quotes validated by substring match.
- **Judge-then-score.** The performance grader emits per-criterion pass/partial/fail verdicts with quotes — never a number. `grade-compute.mjs` validates every quote against the response text, applies the floor gate (brand named + right entity + no kill-criterion failure), and computes scores in code. Unsure or quote-invalid verdicts queue for human adjudication.
- **Theory vs practice.** Every element gets an **importance score**: an evidence-tier prior from the published research, blended with the observed citation signal in this company's own measured answers (which roundups did the models actually cite? whose product pages won the category answers?). The blend is practice-led (25/75) after calibration on real audits. **Priority = importance × gap** ranks the fix list — so the #1 fix is provably the thing AI already uses that the company is weakest at.

See [`.claude/context/aeo-audit-framework.md`](.claude/context/aeo-audit-framework.md) for the full methodology.

## How it runs — 3 phases, 2 human gates

Each phase is a slash command (`.claude/commands/`) that orchestrates agents and scripts, then **stops at a gate** for human review. Nothing auto-advances.

```
/audit-prep  <Company> <domain>   Research: pin the entity, draft prompts + rubric   ── Gate 1: approve prompts
/audit-run   <slug>               Analysis: query surfaces, gather evidence,         ── Gate 2: approve findings
                                  grade, score, reason out the fixes
/audit-report <slug>              Reporting: compile the client deck
```

- **Research** (`/audit-prep`) — researches the company from public sources, pins the exact entity (halts on ambiguity), and drafts the Discoverability + Assessment prompts with per-criterion success rubrics. Parks them for operator approval.
- **Analysis** (`/audit-run`) — queries the three surfaces (web search on, *k* runs/prompt), gathers the deterministic + evidence ledgers, classifies, grades judge-then-score, scores the four levers with the importance layer, then a reasoning agent decides the fixes. Parks the verdict + scorecards + fix list for review.
- **Reporting** (`/audit-report`) — fills a hand-built Canva master (unique `[[token]]` placeholders) from the approved data to compile the per-prospect deck.

## Architecture

The split is deliberate: anything that should be reproducible and cheap is a deterministic script; anything that needs judgment is an agent grounded by a shared methodology file.

**Deterministic harness** (`.mjs`, Node, native `fetch`, zero dependencies):

| File | Role |
|------|------|
| `run-prompts.mjs` (+ `lib/surfaces.mjs`, `lib/openrouter.mjs`) | Query Claude, Perplexity, and ChatGPT via OpenRouter (web search on, *k* runs/prompt, retries + honest error rows) → `raw_responses.jsonl` |
| `classify.mjs` | Tag each answer (brand mentioned? own domain cited?), type every citation, and extract the **answer-derived consideration set** for share-of-voice → `classified.jsonl`, `consideration.json` |
| `access-checks.mjs` | Robots rules per AI-bot class (training vs search vs user-fetch), live user-agent probes, Bing + Brave index presence → `access.json` |
| `site-checks.mjs` | Frozen page sample + scripted on-site facts (raw-HTML fetchability, crawl coverage, schema, freshness, FAQ/pricing) → `site-facts.json` |
| `grade-compute.mjs` | Validates every grader quote against the response, applies the floor gate, computes Performance Scores in code → `graded.jsonl`, `review-queue.json` |
| `compute-metrics.mjs` | Mention/citation rates, per-prompt *k/n* counts, blended + portrayal-when-named performance, share-of-voice → `metrics.json` |
| `score-elements.mjs` | Scores all ~28 lever elements against the anchored rubric over the frozen ledgers → `levers.json` |
| `score-importance.mjs` (+ `lib/importance.mjs`) | Blends research prior × observed signal, ranks every gap by importance × (5 − score) → `importance.json` (merged into `levers.json`) |
| `score-levers.mjs` | Back-compat shim that runs `score-elements` then `score-importance` |
| `build-findings.mjs` | Deterministic stitch of the run's artifacts into one human-readable Gate 2 doc → `findings.md` |
| `build-audit-log.mjs` | Per-element rows (score + importance + fix) for the optional Notion Audit Log → `audit-log.json` |
| `build-deck.mjs` | Flattens everything into the `[[token]]` dataset the client deck is filled from → `canva-fill.json` |
| `prose-lint.mjs` | High-precision AI-writing-tell linter; hard-fails on em dashes |
| `lib/rubric.mjs` | The framework encoded: element registry, anchor ladders, archetype profiles, importance weights |

**LLM judgment agents** (`.claude/agents/`):

| Agent | Job |
|-------|-----|
| `audit-context-gatherer` | Research the company, pin the exact entity + archetype profile → `context.md` |
| `audit-prompt-definer` | Draft the test prompts + the per-criterion grading rubric (weight/kill) — the Gate 1 artifact |
| `audit-offsite-evidence` | Facts ledger for the Reputation lever + off-site Identity (press, roundups, validation sources, directories, Wikipedia) — facts with URLs, never scores |
| `audit-onsite-evidence` | Facts ledger for the Content lever + on-site Identity (guides, comparisons, case studies, research assets) |
| `audit-performance-grader` | **The wedge** — per-criterion verdicts with verbatim quotes; the score itself is computed in code |
| `audit-fix-brief` | A run-aware strategy brief fusing the brand's positioning with this run's findings → `fix-context.md` |
| `audit-fix-strategist` | The reasoning step that **determines** the fixes — bespoke, re-ranked, with named targets from the ledgers → `fixes.json` |
| `audit-insights-stager` | Synthesizes the verdict, two scorecards, and the priority-ranked fix list (Gate 2) |
| `audit-report-writer` | Writes the client-facing HTML report, led by the verdict |

## The worked example — `companies/northwind/`

A complete audit of a **fictional** company, **Northwind Pay** (a stablecoin payments API). Every number, finding, and quote is synthetic — see the banner in `companies/northwind/context.md`. Real companies appear only as market-context competitors.

Open [`companies/northwind/report.html`](companies/northwind/report.html) in a browser for the final deliverable. The verdict it lands on: **discoverability is broken, assessment is strong** — Northwind is described accurately when asked by name (4.3/5, named in 100% of answers) but barely surfaces in category questions (1.7/5, named in 3 of 9). The supporting artifacts trace every step: `prompts.json` → `raw_responses.jsonl` → `classified.jsonl` + `consideration.json` → `graded.jsonl` → `metrics.json` → `access.json` + **`levers.json`** (the four-lever scorecard with anchors, importance, and the priority ranking) → `findings.json` + `deck-overrides.json`.

## Running it yourself

The agents and commands are designed for [Claude Code](https://claude.com/claude-code). The harness scripts run with plain Node.

```bash
cp .env.example .env          # add your OpenRouter key
npm run test:surfaces         # re-queries the surfaces for the example slug
node classify.mjs northwind   # + consideration-set extraction with the key set
node compute-metrics.mjs northwind
node score-levers.mjs northwind   # score the four levers + importance ranking
node build-deck.mjs northwind     # flatten everything into the deck-fill tokens
```

## License

MIT — see [LICENSE](LICENSE). Built by Patrick Kemp / [Lobo Growth](https://lobogrowth.com).
