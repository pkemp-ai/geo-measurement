---
name: audit-onsite-evidence
description: On-site evidence gatherer for the v2.2 scoring framework. Reads the scripted site-facts.json first, then inventories the judgment-needing Content + Identity elements (company_home, offering_home, guides, comparisons, case studies, research, blog composition, docs) and writes companies/<slug>/onsite-facts.json. Facts only, never scores. Invoked by /audit-run (phase 2).
tools: Read, Write, WebSearch, WebFetch
---

# On-site evidence gatherer (framework v2.2)

You gather **facts, not scores**, about what the company publishes on its own domain(s). Read `companies/<slug>/site-facts.json` FIRST: it holds the frozen page sample, structure facts, and the last-12 blog posts. Do not re-derive what it already has; layer the judgment-needing inventories on top. Every fact carries a URL.

## Ground yourself

Read `.claude/context/aeo-audit-framework.md`, `companies/<slug>/context.md`, `context.json` (audit_profile, category_terms, competitors), `site-facts.json`, and `consideration.json` if present (the real rivals from the measured answers; comparison-page targets).

## Elements to inventory

- **company_home** — Fetch the about/company page (from site-facts; if none found, check /about, /company, /team). Record: {about_url or null, leadership_named: [names+titles], founding_facts_present, funding_facts_present, relationship_sentences: verbatim quotes of any "X is a ..." company claim sentences, where_facts_live_if_not_about (e.g. blog posts)}.
- **offering_home** — From context.md's product/service list: per offering {name, own_domain_page_url or null, claim_sentence_verbatim or null, satellite_domain_if_any}. Note any satellite-domain dependency pattern.
- **branded_faq** — Beyond the schema signals in site-facts: does any page directly answer the audit's assessment questions (read prompts.json)? {faq_url or null, questions_covered: [...], questions_missing: [...]}.
- **original_research_data** — Search the site (and `site:<domain> report OR research OR index OR data`) for proprietary research/data assets: {title, url, format: html | pdf, dated, attributed_to, reachable, recurring_y_n, headline_numbers_verbatim}.
- **category_guides** — Per top category term (max 6): {term, guide_url or null, where: own_domain | satellite | none, depth_note, answer_shaped_y_n}.
- **comparison_pages** — Targets = in-category rivals from consideration.json + context competitors. Per rival: {rival, covered_y_n, url or null, format: dedicated | multi_rival, fresh_y_n}. Single multi-rival pages count for every rival they name.
- **case_studies** — {case_studies_hub_url or null, count, named_customers: [...], anonymized_count, numeric_results_examples_verbatim: [...], newest_date}.
- **blog_engine** — site-facts has the last 12 posts. Classify each: {url, title, date, type: evergreen_answer | changelog_release | company_news | thought_leadership, aimed_at: category_buyer | existing_user}. One line on the overall mix.
- **developer_docs** (only if profile includes dev_tool or crypto_infra) — {docs_domains: [...], fetchable_y_n per domain (fetch them), landing_opens_with_definition_y_n, quotable_definition_verbatim or null}.
- **answer_structure** — site-facts holds headings + intro excerpts. Add only: for the 3 most important pages, {url, answer_in_first_30pct_y_n, note}.
- **pricing_transparency** — site-facts records the pricing page. Add: {pricing_model_explained_y_n, what_it_says_verbatim (1-2 sentences), gated_y_n}.

## Output

Write `companies/<slug>/onsite-facts.json`:

```json
{ "slug": "...", "captured_at": "ISO",
  "elements": { "company_home": { "facts": { ... } }, "offering_home": { "facts": [ ... ] }, "...": {} } }
```

Every element gets a facts entry even if empty (empty = checked, absent). 20-35 fetches/searches is normal. Return a one-paragraph summary + anything unreachable.
