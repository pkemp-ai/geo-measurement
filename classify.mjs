// Citation classifier + consideration-set extractor.
//
// Two stages with different trust models:
//
//   A. DETERMINISTIC, key-free — per (prompt x surface) row: was the brand
//      named, was its own domain cited, which PRE-LISTED competitors appeared,
//      and a source-type tag per citation. No network, no LLM.
//
//   B. LLM-backed (needs OPENROUTER_API_KEY) — for discoverability answers,
//      extract the consideration set the answer ACTUALLY builds (every brand it
//      offers as an option), then gate each extracted name through a
//      same-category check against the audited company. Only same-category
//      names count toward share-of-voice, so the SOV table reflects who really
//      won the category answer — not just the competitors we guessed at prep
//      time. (Before this, SOV only counted context.json competitors, so a
//      privacy-L1 audit could miss Secret Network / Oasis / DERO entirely.)
//
// Stage B degrades gracefully: with no key, or on any extraction failure, each
// discoverability row falls back to its deterministic pre-listed competitors and
// the sidecar records that extraction was skipped — the pipeline never breaks.
//
// brand_mentioned is a NAME string-match — it can't tell a wrong-entity answer
// (a different "Atlas") from the real brand. The performance grader is
// authoritative on correct entity; the insights stager reconciles the two.
//
//   node classify.mjs northwind

import { readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { complete } from "./lib/openrouter.mjs";

// Pinned judge for Stage B. Pin to a dated snapshot when one is available so
// re-runs stay comparable; override with AUDIT_JUDGE_MODEL.
const JUDGE_MODEL = process.env.AUDIT_JUDGE_MODEL ?? "anthropic/claude-sonnet-4.6";

const company = process.argv[2];
if (!company) throw new Error("usage: node classify.mjs <slug>");
const root = dirname(fileURLToPath(import.meta.url));
const dir = `${root}/companies/${company}`;

const ctx = JSON.parse(await readFile(`${dir}/context.json`, "utf8"));
const rows = (await readFile(`${dir}/raw_responses.jsonl`, "utf8"))
  .split("\n").filter(Boolean).map((l) => JSON.parse(l))
  .filter((r) => (r.status ?? "ok") === "ok"); // error rows stay out of every denominator

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const named = (text, names) => names.some((n) => n && new RegExp(`\\b${esc(n)}\\b`, "i").test(text));
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

const brandHost = (ctx.domain || "").replace(/^www\./, "");
const brandNames = [ctx.company, ...(ctx.aliases ?? [])].filter(Boolean);
const competitors = ctx.competitors ?? [];
const compHosts = new Map(competitors.filter((c) => c.domain).map((c) => [c.domain.replace(/^www\./, ""), c.name]));

const TYPE_RULES = [
  [/(^|\.)reddit\.com$/, "reddit"],
  [/(^|\.)(g2|capterra|trustpilot|getapp)\.com$/, "review_site"],
  [/(^|\.)wikipedia\.org$/, "wikipedia"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "video"],
  [/(^|\.)(linkedin|crunchbase|pitchbook)\.com$/, "directory"],
];

// root domain (strip subdomain) so docs.brale.xyz / developers.circle.com match
// a competitor listed by its apex domain. Light 2-level-TLD handling (.gov.hk etc).
const rootDomain = (h) => {
  if (!h) return "";
  const p = h.split(".");
  if (p.length <= 2) return h;
  return /\.(co|com|org|net|gov|ac|edu)\.[a-z]{2}$/.test(h) ? p.slice(-3).join(".") : p.slice(-2).join(".");
};
const compRoots = new Map(competitors.filter((c) => c.domain).map((c) => [rootDomain(c.domain.replace(/^www\./, "")), c.name]));

// "best X" / "X vs Y" / "alternatives" roundups — the listicle surface, by title or URL.
const ROUNDUP = /\b(best|top[\s-]?\d+|alternatives?|versus|compared|comparison|ultimate list|complete list)\b|\bvs\.?\b/i;
// Known news/trade-media + wire outlets (apex domains).
const NEWS = new Set("nytimes.com wsj.com washingtonpost.com reuters.com bloomberg.com ft.com forbes.com fortune.com cnbc.com cnn.com axios.com economist.com theguardian.com apnews.com businessinsider.com time.com wired.com theverge.com techcrunch.com theinformation.com coindesk.com cointelegraph.com theblock.co decrypt.co dlnews.com blockworks.co americanbanker.com pymnts.com finextra.com bankingdive.com beincrypto.com cryptoslate.com cryptopotato.com businesswire.com prnewswire.com globenewswire.com".split(" "));
// Government / regulator / central-bank / standards / academic reference sources.
const REF = new Set("stlouisfed.org federalreserve.gov bis.org imf.org worldbank.org oecd.org ecb.europa.eu europa.eu finra.org iso.org ietf.org w3.org nist.gov arxiv.org ssrn.com ieee.org nature.com sciencedirect.com".split(" "));
const isRef = (h) => REF.has(h) || /\.gov(\.[a-z]{2})?$/.test(h) || /\.edu$/.test(h) || /\.ac\.[a-z]{2}$/.test(h);

// Deterministic citation role. The old single "press_or_other" bucket is gone:
// the knowable types resolve here, and the genuine residual lands as "other"
// (Stage C then LLM-resolves "other" into competitor/news_press/reference/explainer).
function classifyCitation(c, h) {
  if (!h) return "other";
  if (brandHost && (h === brandHost || h.endsWith("." + brandHost))) return "own_domain";
  if (compHosts.has(h) || compRoots.has(rootDomain(h))) return "competitor";
  for (const [re, t] of TYPE_RULES) if (re.test(h)) return t;
  if (ROUNDUP.test(`${c.title ?? ""} ${c.url ?? ""}`)) return "listicle";
  if (isRef(h)) return "reference";
  if (NEWS.has(rootDomain(h)) || NEWS.has(h)) return "news_press";
  return "other";
}

// ---- Stage A: deterministic classification (key-free) ----
const out = rows.map((r) => {
  const { raw, ...row } = r; // full provider payload stays in raw_responses.jsonl only
  const text = row.response ?? "";
  const citations = (row.citations ?? []).map((c) => {
    const h = host(c.url);
    return { ...c, host: h, source_type: classifyCitation(c, h) };
  });
  return {
    ...row,
    brand_mentioned: named(text, brandNames),
    own_domain_cited: citations.some((c) => c.source_type === "own_domain"),
    competitors_mentioned: competitors.map((c) => c.name).filter((n) => named(text, [n])),
    citations,
  };
});

// ---- Stage B: answer-derived consideration set, gated by category ----

// Light canonicalization so "Acme" / "Acme Network" and "Globex" /
// "Globex Labs" collapse to one share-of-voice entry.
const STOPWORDS = /\b(network|protocol|labs?|inc|incorporated|llc|foundation|the|co)\b/gi;
const normKey = (s) => String(s).toLowerCase()
  .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, " ")
  .replace(STOPWORDS, " ")
  .replace(/\s+/g, " ").trim();

// Canonical-entity resolution. Exact-key matching split compound surface forms
// into separate SOV entries — a brand's "<Brand> Vault" escaped the brand
// exclusion and a parent's "<Parent> Recover" / "<Parent> Control" product names
// fragmented the parent across three rows. Match the known entities (brand aliases
// + prep competitors)
// by PHRASE CONTAINMENT so a parent's products collapse to the parent.
const brandKeys = [...new Set(brandNames.map(normKey))].filter(Boolean); // brand + its product/alias keys
const compEntities = competitors.map((c) => ({ key: normKey(c.name), name: c.name })).filter((c) => c.key);
// Does normalized key `hay` contain the whole known phrase `needle` at token boundaries?
const phraseHit = (hay, needle) => !!needle && ` ${hay} `.includes(` ${needle} `);
// Resolve an extracted name to a canonical consideration-set entry.
// -> null to DROP (empty, or the audited brand / one of its products);
//    else { key, name, pinned } where pinned = matched a prep competitor (use its canonical name).
const resolveEntity = (raw) => {
  const k = normKey(raw);
  if (!k) return null;
  if (brandKeys.some((bk) => phraseHit(k, bk))) return null;          // brand or a brand product
  const comp = compEntities.find((c) => phraseHit(k, c.key));         // a prep competitor or its product
  if (comp) return { key: comp.key, name: comp.name, pinned: true };
  return { key: k, name: raw, pinned: false };                        // extracted-only: keep the surface form
};

// Canonical display name per key: a pinned prep-competitor name wins; otherwise the
// fullest surface form seen. Shared by the live pass and --recanon.
const displayFor = (names) => {
  const m = new Map();
  for (const n of names) {
    const res = resolveEntity(n);
    if (!res) continue;
    if (res.pinned) { m.set(res.key, res.name); continue; }
    const prev = m.get(res.key);
    if (!prev || res.name.length > prev.length) m.set(res.key, res.name);
  }
  return m;
};

// --recanon: deterministic re-pass over a PAST run. Re-resolve the saved
// consideration sets + candidate list through the current canonicalization, with no
// OpenRouter calls — the metered work (entity extraction, the category gate, Stage-C
// citation roles) is already in classified.jsonl / consideration.json and is preserved
// verbatim. This is how a canonicalization change lands on existing audits for free;
// follow with `node compute-metrics.mjs <slug>` to rebuild the share-of-voice.
if (process.argv.includes("--recanon")) {
  const prior = (await readFile(`${dir}/classified.jsonl`, "utf8")).split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const sidecar = JSON.parse(await readFile(`${dir}/consideration.json`, "utf8"));
  const discPrior = prior.filter((r) => r.track === "discoverability" && Array.isArray(r.consideration_set));
  const display = displayFor([...discPrior.flatMap((r) => r.consideration_set), ...(sidecar.candidates ?? [])]);
  let drops = 0, merges = 0;
  for (const r of discPrior) {
    const seen = new Set(), set = [];
    for (const e of r.consideration_set) {
      const res = resolveEntity(e);
      if (!res) { drops++; continue; }                 // brand / brand product removed from SOV
      if (seen.has(res.key)) { merges++; continue; }   // fragment folded into its canonical
      seen.add(res.key);
      set.push(display.get(res.key) ?? res.name);
    }
    r.consideration_set = set;
  }
  const candsBefore = (sidecar.candidates ?? []).length;
  const seenC = new Set(), cands = [];
  for (const c of (sidecar.candidates ?? [])) { const res = resolveEntity(c); if (!res || seenC.has(res.key)) continue; seenC.add(res.key); cands.push(display.get(res.key) ?? res.name); }
  sidecar.candidates = cands; sidecar.n_candidates = cands.length;
  sidecar.recanonicalized_at = new Date().toISOString();
  await writeFile(`${dir}/classified.jsonl`, prior.map((r) => JSON.stringify(r)).join("\n") + "\n");
  await writeFile(`${dir}/consideration.json`, JSON.stringify(sidecar, null, 2) + "\n");
  console.log(`recanon ${company}: ${cands.length} candidates (was ${candsBefore}); ${drops} brand-product occurrence(s) dropped, ${merges} fragment occurrence(s) merged across discoverability rows.`);
  console.log(`next: node compute-metrics.mjs ${company}`);
  process.exit(0);
}

const parseJSON = (text) => {
  const cleaned = String(text).replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const s = cleaned.search(/[{[]/);
  const e = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
  if (s === -1 || e < s) throw new Error("no JSON in model output");
  return JSON.parse(cleaned.slice(s, e + 1));
};

const extractPrompt = (q, answer) => `A buyer asked an AI assistant this category question:
"${q}"

Below is the assistant's answer. List every distinct company, product, project, or brand the answer presents as an OPTION, RECOMMENDATION, or EXAMPLE the buyer could choose for this need — the consideration set the answer builds. Include names mentioned in passing as alternatives.
EXCLUDE: the buyer, pure technologies or standards (e.g. "zero-knowledge proofs"), and entities named only as background or infrastructure that are not themselves a choice.
Return ONLY JSON: {"entities": ["Name", ...]} using each entity's most complete proper name. If none, return {"entities": []}.

ANSWER:
${answer}`;

const categoryPrompt = (cands) => `The audited company is "${ctx.company}". Its category, in the buyer's own terms: ${(ctx.category_terms ?? []).join(", ") || "(unspecified)"}.

Below is a list of names extracted from AI answers to category questions a buyer asked. For EACH name, decide whether it competes in the SAME category as ${ctx.company} — i.e. a buyer weighing options for that category would reasonably treat it as a direct alternative. Mark as in_category=false anything in an adjacent-but-different category: a different layer of the stack, a different product type, mere infrastructure, or a general-purpose player not in this specific niche.
Return ONLY JSON: {"results": [{"name": "<exact input name>", "in_category": true, "reason": "<short>"}]}.

NAMES:
${cands.map((c) => `- ${c}`).join("\n")}`;

const discRows = out.filter((r) => r.track === "discoverability");
const sidecar = { judge_model: JUDGE_MODEL, source: "extracted", n_candidates: 0, candidates: [], judgments: [], generated_at: new Date().toISOString() };

if (process.env.OPENROUTER_API_KEY && discRows.length) {
  try {
    // B1 — extract the named consideration set from each discoverability answer.
    const perRow = await Promise.all(discRows.map(async (r) => {
      const { text } = await complete(extractPrompt(r.prompt ?? "", r.response ?? ""), { model: JUDGE_MODEL });
      const parsed = parseJSON(text);
      const ents = Array.isArray(parsed.entities) ? parsed.entities.filter((e) => typeof e === "string" && e.trim()) : [];
      return { r, ents };
    }));

    // Dedupe candidates across all answers (excluding the brand itself).
    const candByKey = new Map(); // canonical key -> display name
    for (const { ents } of perRow) {
      for (const e of ents) {
        const r = resolveEntity(e);
        if (!r) continue;
        if (r.pinned) { candByKey.set(r.key, r.name); continue; } // prep canonical name wins
        const prev = candByKey.get(r.key);
        candByKey.set(r.key, prev && prev.length >= r.name.length ? prev : r.name); // keep the fullest surface form
      }
    }
    const candidates = [...candByKey.values()];

    // B2 — THE CATEGORY GATE. Every unique candidate is checked for same-category
    // membership; only those that pass count toward the consideration set / SOV.
    const inCategory = new Map(); // key -> bool
    if (candidates.length) {
      const { text } = await complete(categoryPrompt(candidates), { model: JUDGE_MODEL });
      const parsed = parseJSON(text);
      sidecar.judgments = Array.isArray(parsed.results) ? parsed.results : [];
      for (const j of sidecar.judgments) {
        if (j && typeof j.name === "string") inCategory.set(normKey(j.name), j.in_category === true);
      }
    }
    sidecar.candidates = candidates;
    sidecar.n_candidates = candidates.length;

    // B3 — attach the category-gated consideration set to each row.
    for (const { r, ents } of perRow) {
      const seen = new Set();
      const set = [];
      for (const e of ents) {
        const res = resolveEntity(e);
        if (!res || seen.has(res.key)) continue;
        if (inCategory.get(res.key) !== true) continue; // dropped: off-category (or unjudged)
        seen.add(res.key);
        set.push(candByKey.get(res.key) ?? res.name);
      }
      r.consideration_set = set;
    }
  } catch (err) {
    console.warn(`! consideration-set extraction failed (${err.message}); falling back to pre-listed competitors`);
    sidecar.source = "fallback_prelisted";
  }
} else {
  if (!process.env.OPENROUTER_API_KEY) console.warn("! OPENROUTER_API_KEY not set; consideration set falls back to pre-listed competitors");
  sidecar.source = "fallback_prelisted";
}

// Any discoverability row without an extracted set (fallback path, or an answer
// whose extraction errored) uses the deterministic pre-listed competitors.
for (const r of out) {
  if (r.track === "discoverability" && !Array.isArray(r.consideration_set)) {
    r.consideration_set = r.competitors_mentioned ?? [];
  }
}

// ---- Stage C: resolve the deterministic "other" residual into citation roles ----
// LLM-labels each unique residual domain as competitor / news_press / reference /
// explainer / other, so the old catch-all stops hiding rivals-not-in-prep and the
// third-party explainer pages that win category answers. Degrades to "other".
const residualHosts = [...new Set(out.flatMap((r) => (r.citations ?? []).filter((c) => c.source_type === "other" && c.host).map((c) => c.host)))];
sidecar.citation_roles = { method: "deterministic_only", residual_hosts: residualHosts.length, resolved: 0 };
if (process.env.OPENROUTER_API_KEY && residualHosts.length) {
  try {
    const titleFor = (h) => out.flatMap((r) => r.citations ?? []).find((c) => c.host === h && c.title)?.title ?? "";
    const list = residualHosts.map((h) => `- ${h} :: ${String(titleFor(h)).slice(0, 70)}`).join("\n");
    const prompt = `Classify the ROLE each domain plays as a citation in AI answers about ${ctx.company} (${ctx.domain}) and its category: ${(ctx.category_terms ?? []).slice(0, 5).join(", ")}.
Roles:
- competitor: a company that competes with or is a direct alternative to ${ctx.company} in this category (its own site/docs/blog)
- listicle: a "best X" / "top X" / roundup / ranked-list / alternatives page naming multiple vendors
- news_press: a news or trade-media outlet
- reference: government, regulator, central bank, standards body, or academic source
- explainer: a neutral third party's educational/explainer/guide page about the category (single-topic, not a ranked list, not a direct competitor, not news)
- other: none of the above
Return ONLY JSON: {"results":[{"domain":"<exact>","role":"competitor|listicle|news_press|reference|explainer|other"}]}

DOMAINS:
${list}`;
    const { text } = await complete(prompt, { model: JUDGE_MODEL, max_tokens: 2000 });
    const roleMap = new Map((parseJSON(text).results ?? []).filter((x) => x?.domain && x?.role).map((x) => [x.domain, x.role]));
    const allowed = new Set(["competitor", "listicle", "news_press", "reference", "explainer", "other"]);
    let resolved = 0;
    for (const r of out) for (const c of r.citations ?? []) {
      if (c.source_type !== "other") continue;
      const role = roleMap.get(c.host);
      if (allowed.has(role)) { c.source_type = role; if (role !== "other") resolved++; }
    }
    sidecar.citation_roles = { method: "llm", judge_model: JUDGE_MODEL, residual_hosts: residualHosts.length, resolved };
  } catch (err) {
    console.warn(`! citation role resolution failed (${err.message}); residual stays 'other'`);
  }
}

await writeFile(`${dir}/classified.jsonl`, out.map((r) => JSON.stringify(r)).join("\n") + "\n");
await writeFile(`${dir}/consideration.json`, JSON.stringify(sidecar, null, 2) + "\n");

const kept = sidecar.judgments.filter((j) => j.in_category === true).length;
console.log(`classified ${out.length} rows -> ${dir}/classified.jsonl`);
console.log(`consideration set (${sidecar.source}): ${sidecar.n_candidates} candidates, ${kept} in-category -> ${dir}/consideration.json`);
