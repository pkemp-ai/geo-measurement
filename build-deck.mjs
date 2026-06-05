// Deck builder — deterministic, key-free, no deps. Fills the 12-slide deck
// template with one company's data, producing the Gamma `generate` inputText at
// companies/<slug>/deck.md.
//
//   node build-deck.mjs <slug>
//
// Two kinds of token:
//   - mechanical (rates, scores, share of voice, cited domains, example prompts)
//     resolve straight from the company JSONs.
//   - editorial one-liners (gap callouts, summaries, the crisp fixes) come from
//     companies/<slug>/deck-overrides.json so they stay tight and on-voice.
// Any unresolved [[token]] aborts the build (exit 1) — a deck never ships with a
// literal placeholder in it. Run prose-lint.mjs on the output as the final gate.

import { readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const slug = process.argv[2];
if (!slug) throw new Error("usage: node build-deck.mjs <slug>");
const root = dirname(fileURLToPath(import.meta.url));
const dir = `${root}/companies/${slug}`;
const load = async (f) => JSON.parse(await readFile(`${dir}/${f}`, "utf8"));
const loadOpt = async (f) => { try { return await load(f); } catch { return {}; } };

const [ctx, metrics, findings, reputation, content, site, prompts, overrides] = await Promise.all([
  load("context.json"), load("metrics.json"), load("findings.json"),
  load("reputation.json"), load("content.json"), load("site.json"),
  load("prompts.json"), loadOpt("deck-overrides.json"),
]);

const pct = (x) => `${Math.round(x * 100)}%`;
const perf = (x) => `${x.toFixed(2)}`;
const deDash = (s) => s.replace(/\s*—\s*/g, ", ");
const firstPrompt = (track) => deDash((prompts.find((p) => p.track === track)?.text || "").trim());

const scoreList = (dims, labels) =>
  Object.entries(labels)
    .map(([k, label]) => ({ label, score: dims[k]?.score }))
    .filter((d) => d.score != null)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .map((d) => `${d.label} ${d.score}`)
    .join(", ");

const repLabels = { press: "Press", directories: "Directories", wikipedia: "Wikipedia", podcasts_bylines: "Podcasts", reddit: "Reddit", review_site: "Review sites", listicles: "Listicles" };
const contentLabels = { original_research_data: "Original research", definitive_guides: "Definitive guides", named_frameworks: "Named frameworks", backlinks_syndication: "Backlinks", publishing_cadence: "Cadence" };
const siteLabels = { fetchability_no_js: "Fetchable without JS", llms_txt: "llms.txt", schema_markup: "Schema", claim_sentence_density: "Claim density", team_about_clarity: "About and team", internal_linking: "Internal links", faq_presence: "FAQ", pricing_clarity: "Pricing" };

const sovRanked = () => [[ctx.company, metrics.share_of_voice.brand], ...Object.entries(metrics.share_of_voice.competitors)]
  .sort((a, b) => b[1] - a[1] || (a[0] === ctx.company ? -1 : b[0] === ctx.company ? 1 : a[0].localeCompare(b[0])));
const sovTable = () => sovRanked().map(([name, n]) => `${name} ${n}`).join(", ");

const srcLabel = { own_domain: "you", competitor: "competitor", press_or_other: "third-party", reddit: "Reddit", review_site: "review site", wikipedia: "Wikipedia", directory: "directory", video: "video", other: "other" };
const topCited = () =>
  (metrics.top_cited_domains?.discoverability || []).slice(0, 3)
    .map((d) => `${d.host} ${pct(d.rate)} (${srcLabel[d.source_type] || d.source_type})`)
    .join(", ");

const editorial = ["disc_gap", "assess_gap", "cited_insight", "sov_insight", "rep_summary", "content_summary", "site_summary", "rep_top_fix", "content_top_fix", "site_top_fix"];

const tokens = {
  company: ctx.company,
  audit_date: overrides.audit_date,
  disc_example_prompt: firstPrompt("discoverability"),
  assess_example_prompt: firstPrompt("assessment"),
  disc_mention: pct(metrics.by_track.discoverability.mention_rate),
  disc_citation: pct(metrics.by_track.discoverability.citation_rate),
  disc_performance: perf(findings.discoverability.avg_performance),
  assess_mention: pct(metrics.by_track.assessment.mention_rate),
  assess_citation: pct(metrics.by_track.assessment.citation_rate),
  assess_performance: perf(findings.assessment.avg_performance),
  sov_table: sovTable(),
  top_cited_domains: topCited(),
  rep_scores: scoreList(reputation.dimensions, repLabels),
  content_scores: scoreList(content.dimensions, contentLabels),
  site_scores: scoreList(site.dimensions, siteLabels),
  ...Object.fromEntries(editorial.map((k) => [k, overrides[k]])),
};

const SLIDES = [
  { title: "[[company]]", body: "AI Response Audit\n[[audit_date]]" },
  { title: "One audit, run by a multi-agent system", body: "Specialist agents run the whole audit. They research the company, query the models, audit on-site and off-site signals, and grade every answer. The same system we build for clients.\n\nResearch → Run → Analyze" },
  { title: "We use three metrics to measure AI responses", body: "Most tools stop at the first two.\n\n**Mention rate.** Do you show up?\n**Citation rate.** Does the answer pull from your own site?\n**Performance score.** Are you described well enough to win?" },
  { title: "We break prompts into two groups", body: "**Discovery.** Category questions you want to win.\nExample: *[[disc_example_prompt]]*\nLevers: third-party references and citeable content.\n\n**Assessment.** Questions about you, by name, that have to be accurate.\nExample: *[[assess_example_prompt]]*\nLevers: a bot-readable site with structured facts." },
  { title: "How [[company]] shows up in AI responses", body: "**Discovery: the category question**\nMention [[disc_mention]] · Citation [[disc_citation]] · Performance [[disc_performance]]\n[[disc_gap]]\n\n**Assessment: vetted by name**\nMention [[assess_mention]] · Citation [[assess_citation]] · Performance [[assess_performance]]\n[[assess_gap]]" },
  { title: "How [[company]] stacks up to competitors", body: "**Share of voice** (how often each brand is named across the category prompts): [[sov_table]]\n\n**Top cited domains** (the sites AI pulls from to answer category questions): [[top_cited_domains]]\n\n[[cited_insight]]" },
  { title: "Increasing performance requires success on three dimensions", body: "Performance is not luck. Three things decide whether AI describes you well.\n\n**Reputation.** What others say about you across the sources AI trusts.\n**Content.** Whether your own site is citeable, not just live.\n**Site.** Whether a bot can read and verify your facts without a browser." },
  { title: "Reputation: what AI's sources say about you", body: "[[rep_summary]]\n\nScores (0 to 5): [[rep_scores]]\n\n**Highest-leverage fix:** [[rep_top_fix]]" },
  { title: "Content: a source, or just pages?", body: "[[content_summary]]\n\nScores (0 to 5): [[content_scores]]\n\n**Highest-leverage fix:** [[content_top_fix]]" },
  { title: "Site: can a bot read and verify you?", body: "[[site_summary]]\n\nScores (0 to 5): [[site_scores]]\n\n**Highest-leverage fix:** [[site_top_fix]]" },
  { title: "Your three highest-leverage fixes", body: "The one move that matters most in each dimension. Ranked by impact.\n\n1. **Reputation.** [[rep_top_fix]]\n2. **Content.** [[content_top_fix]]\n3. **Site.** [[site_top_fix]]" },
  { title: "From metrics to action", body: "This audit is the scoring layer. The same system can run the fixes.\n\nMost teams stop at a dashboard and a list of to-dos, then chase them by hand.\n\nAn agentic stack goes further: channel-specific agents, fed the structured data and context from this audit, that raise the score directly. The audit you just read is the first agent in that stack." },
];

const unresolved = new Set();
const fill = (s) => s.replace(/\[\[(\w+)\]\]/g, (_, k) => {
  const v = tokens[k];
  if (v == null || v === "") { unresolved.add(k); return `[[${k}]]`; }
  return v;
});

const cards = SLIDES.map((s) => `# ${fill(s.title)}\n\n${fill(s.body)}`).join("\n\n---\n\n") + "\n";
if (unresolved.size) {
  console.error(`Unresolved tokens (add to deck-overrides.json): ${[...unresolved].join(", ")}`);
  process.exit(1);
}

// Canva autofill dataset — flat field -> string. Carries both joined list strings
// and exploded per-item fields, so the hand-built master can use whichever
// granularity each slide needs. All formatting is done here; Canva renders verbatim.
const padN = (a, n) => a.concat(Array(Math.max(0, n - a.length)).fill("")).slice(0, n);
const ranked = sovRanked();
const nDisc = metrics.share_of_voice.n_discoverability || 1;
const cited = (metrics.top_cited_domains?.discoverability || []).slice(0, 6);
const scoreFields = (dims, labels, prefix) =>
  Object.fromEntries(Object.keys(labels).filter((k) => dims[k]?.score != null).map((k) => [`${prefix}_score_${k}`, String(dims[k].score)]));

const canvaFill = {
  company: tokens.company, audit_date: tokens.audit_date,
  disc_example_prompt: tokens.disc_example_prompt, assess_example_prompt: tokens.assess_example_prompt,
  disc_mention: tokens.disc_mention, disc_citation: tokens.disc_citation, disc_performance: tokens.disc_performance,
  assess_mention: tokens.assess_mention, assess_citation: tokens.assess_citation, assess_performance: tokens.assess_performance,
  disc_gap: tokens.disc_gap, assess_gap: tokens.assess_gap, cited_insight: tokens.cited_insight, sov_insight: tokens.sov_insight,
  rep_summary: tokens.rep_summary, content_summary: tokens.content_summary, site_summary: tokens.site_summary,
  rep_top_fix: tokens.rep_top_fix, content_top_fix: tokens.content_top_fix, site_top_fix: tokens.site_top_fix,
  fix_1: tokens.rep_top_fix, fix_2: tokens.content_top_fix, fix_3: tokens.site_top_fix,
  sov_table: tokens.sov_table, top_cited_domains: tokens.top_cited_domains,
  rep_scores: tokens.rep_scores, content_scores: tokens.content_scores, site_scores: tokens.site_scores,
  ...Object.fromEntries(padN(ranked.map(([n]) => n), 8).map((n, i) => [`sov_label_${i + 1}`, n])),
  ...Object.fromEntries(padN(ranked.map(([, v]) => String(v)), 8).map((v, i) => [`sov_value_${i + 1}`, v])),
  ...Object.fromEntries(padN(ranked.map(([, v]) => Math.round((v / nDisc) * 100) + "%"), 8).map((p, i) => [`sov_pct_${i + 1}`, p])),
  ...Object.fromEntries(padN(cited.map((d) => d.host), 6).map((h, i) => [`cited_host_${i + 1}`, h])),
  ...Object.fromEntries(padN(cited.map((d) => `${pct(d.rate)} · ${srcLabel[d.source_type] || d.source_type}`), 6).map((m, i) => [`cited_meta_${i + 1}`, m])),
  ...Object.fromEntries(padN(cited.map((d) => pct(d.rate)), 6).map((r, i) => [`cited_rate_${i + 1}`, r])),
  ...scoreFields(reputation.dimensions, repLabels, "rep"),
  ...scoreFields(content.dimensions, contentLabels, "content"),
  ...scoreFields(site.dimensions, siteLabels, "site"),
};

// Character caps from the Canva master frames (inspection-based, tunable). Warn on overflow.
const LIMITS = {
  company: 30, audit_date: 20,
  disc_example_prompt: 130, assess_example_prompt: 130,
  disc_gap: 130, assess_gap: 130, cited_insight: 160, sov_insight: 130,
  rep_summary: 110, content_summary: 110, site_summary: 110,
  rep_top_fix: 160, content_top_fix: 160, site_top_fix: 160,
};
const over = Object.keys(LIMITS)
  .filter((k) => typeof canvaFill[k] === "string" && canvaFill[k].length > LIMITS[k])
  .map((k) => `${k} ${canvaFill[k].length}/${LIMITS[k]}`);
if (over.length) console.warn(`! over character cap (clips in fixed frames): ${over.join(", ")}`);

await writeFile(`${dir}/deck.md`, cards);
await writeFile(`${dir}/canva-fill.json`, JSON.stringify(canvaFill, null, 2) + "\n");
console.log(`deck  -> ${dir}/deck.md  (${SLIDES.length} cards)`);
console.log(`canva -> ${dir}/canva-fill.json  (${Object.keys(canvaFill).length} fields, ${over.length} over cap)`);
