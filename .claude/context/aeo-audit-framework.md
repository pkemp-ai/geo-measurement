# AEO/GEO Audit — methodology (agent grounding)

Operational grounding for every agent in the AEO/GEO audit stack (context gatherer, prompt definer, performance grader, insights stager, report writer). Read this before doing audit work.

**Source of truth.** This file is the fast, local distillation every agent reads at runtime. In the production system the canonical framework is also mirrored to a Notion workspace page; if you keep a copy there, keep the two in sync.

## The one rule: two jobs, never averaged

AEO/GEO is **two separate jobs**. Score them separately; never combine into one number. The report leads with *which job is broken* — that single line is the wedge that turns an audit into a sales conversation.

1. **Discoverability** — "is the brand in the consideration set?" When a buyer asks a model a *category* question (`best <category> vendor for <use case>`), does the brand get named? Moved mostly OFF-site: the reputation graph (Reddit, G2, Wikipedia, press, listicles, podcasts) + content that is itself a citeable source. On-site fixes don't move it.
2. **Assessment / vetting** — "when asked about the brand *by name*, does the model answer cleanly?" Accurate, complete, non-contradictory. Fully operator-controlled: schema markup, claim-style sentences, fetchable HTML, pricing/team clarity, third-party trust signals. Only matters once the brand is named.

Same diagnostic skeleton, opposite prescriptions. A startup with a great site but no mentions has a *discoverability* problem (PR/reputation) — on-site fixes are wasted. A known brand with a JS-heavy site has a *vetting* problem (schema/content hygiene) — off-site work is redundant.

## The three axes (both tracks score on these)

- **Mention Rate** — was the brand named in the answer?
  - Discoverability: the primary KPI. Moved by the reputation graph.
  - Assessment: the floor — did the model return a substantive, correct-entity answer (vs. "I don't know," refusing, or conflating with another company)?
- **Citation Rate** — did the model cite the brand's *own domain* as a source?
  - Discoverability: the ceiling KPI. Rare — models cite the source layer, not vendor sites, unless the site *is* a source (original research, definitive guides, named frameworks, proprietary data).
  - Assessment: the site should be the primary source about the brand; if it isn't, the model is leaning on third parties to describe the brand.
- **Performance Score** — the wedge. A grader LLM reads each answer against the brand's context (positioning, ICP, differentiators, target competitive frame) and scores how the brand is *portrayed*: accurate, favorable, placed in the right competitive set, described with the right vocabulary. Catches "named but mischaracterized." Everyone ships Mention + Citation Rate; nobody grades the *quality* of what the model says. This is the differentiator.

### Diagnostic logic (three axes → three prescriptions)
- **Not named** → not in the consideration set → reputation gap.
- **Named but never linked** → known but not a source → content gap.
- **Named but scored low** → miscategorized in the model's mental map → positioning gap.

## Surfaces under test (v1)

Claude Sonnet, Perplexity Sonar, ChatGPT — all via OpenRouter, **web search ON** (grounded; an ungrounded answer measures stale training memory and returns zero citations), **1-shot** per prompt per surface. See `lib/surfaces.mjs`. Gemini dropped for v1 (it was the Google / AI-Overviews proxy — clean add-back later).

## Modes

- **Prospecting mode** (v1) — the operator has NOT engaged the company. Context is whatever scrapers assemble (site, LinkedIn, Crunchbase, press). Powers outbound: "we ran a free audit on you."
- **Gated-audit mode** (later) — the company submitted a source-of-truth doc at intake. Context is operator-supplied. Powers the inbound "free audit" flow.

## Brand identity & disambiguation

Keep two things separate:

- **The context gatherer pins the true entity** (domain + one-line descriptor) so *we* know exactly who we're auditing and the grader can judge against the right company. If it can't be pinned confidently, halt and ask the operator.
- **Prompts stay natural — never seed the domain.** Real buyers don't type URLs. For collision-prone names ("Atlas," "Bridge," "Circle"), use the natural human disambiguator — *"tell me about the company Atlas"* — not a URL.
- **A wrong-entity answer is a signal, not a failure mode to engineer away.** If a model answers about a different company (or the common noun), that mismatch *is* the finding — the brand isn't strongly bound to its name. The grader flags it (`wrong_entity`) and assessment Mention Rate counts it as a miss.
