// Element scorer — stage 1 of the lever pipeline (framework v2.2+).
// Freeze-then-score: reads the frozen facts ledgers (access.json, site-facts.json,
// onsite-facts.json, offsite-facts.json) plus post-run inputs (graded.jsonl for
// wrong_entity, consideration.json, classified.jsonl citations) and scores every
// applicable element:
//
//   - mech elements: computed here in code, reproducible by construction.
//   - judged elements: pinned judge at temp 0 against the rubric anchors, with
//     verbatim evidence quotes validated by substring match against the facts.
//     A failed validation retries once, then lands in needs_review.
//
// Output: companies/<slug>/levers.json — element scores, lever rollups, the two
// job rollups, risk register, needs_review, and full version/judge metadata.
// The importance/priority layer is added by score-importance.mjs (stage 2).
//
//   node score-elements.mjs <slug>

import { readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { complete } from "./lib/openrouter.mjs";
import { ELEMENTS, FACTS_SOURCE, VALIDATION_SOURCES, FRAMEWORK_VERSION, RUBRIC_VERSION, PROFILES, applicable } from "./lib/rubric.mjs";
import { scoreContentEngine } from "./lib/content-engine.mjs";

const JUDGE_MODEL = process.env.AUDIT_JUDGE_MODEL ?? "anthropic/claude-sonnet-4.6";
const slug = process.argv[2];
if (!slug) throw new Error("usage: node score-elements.mjs <slug>");
const root = dirname(fileURLToPath(import.meta.url));
const dir = `${root}/companies/${slug}`;

const load = async (f) => JSON.parse(await readFile(`${dir}/${f}`, "utf8"));
const loadOpt = async (f) => { try { return await load(f); } catch { return null; } };
const loadJsonl = async (f) => { try { return (await readFile(`${dir}/${f}`, "utf8")).split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };

const ctx = await load("context.json");
const profiles = [ctx.audit_profile?.primary, ctx.audit_profile?.secondary].filter(Boolean);
if (!profiles.length) throw new Error("context.json needs audit_profile { primary, secondary? } — set at prep, reviewed at Gate 1");
const badProfiles = profiles.filter((p) => !PROFILES.includes(p));
if (badProfiles.length) throw new Error(`context.json audit_profile has unknown key(s): ${badProfiles.join(", ")} — valid: ${PROFILES.join(", ")}`);

const access = await loadOpt("access.json");
const siteFacts = await loadOpt("site-facts.json");
const onsite = await loadOpt("onsite-facts.json");
const offsite = await loadOpt("offsite-facts.json");
const graded = await loadJsonl("graded.jsonl");
const consideration = await loadOpt("consideration.json");
const prompts = (await loadOpt("prompts.json")) ?? [];

const clamp = (x) => Math.max(0, Math.min(5, Math.round(x)));
const round1 = (x) => Math.round(x * 10) / 10;

// ---- mechanical scorers ----
function mechScore(id) {
  if (!access && ["ai_crawler_access", "search_index_presence"].includes(id)) return null;
  switch (id) {
    case "ai_crawler_access": {
      let s = 5; const why = [];
      if (access.robots?.present && !access.robots?.valid) { s -= 1; why.push("robots.txt is not a real file"); }
      for (const [bot, info] of Object.entries(access.bot_rules ?? {})) {
        if (info.allowed) continue;
        if (info.class === "search" || info.class === "user") { s -= 1.5; why.push(`${bot} (${info.class}) robots-blocked`); }
        else if (info.class === "training") { s -= 0.25; why.push(`${bot} (training) blocked — defensible opt-out`); }
      }
      const control = access.ua_probes?.control;
      if (control && !control.blocked) {
        for (const [bot, p] of Object.entries(access.ua_probes)) {
          if (bot === "control" || !p.blocked) continue;
          s -= (access.bot_rules?.[bot]?.class === "training") ? 0.5 : 1.5;
          why.push(`${bot} UA blocked at the edge (HTTP ${p.status ?? "error"})`);
        }
      }
      return { score: clamp(s), rationale: why.length ? why.join("; ") : "no AI search/user bot blocked in robots or at the edge" };
    }
    case "search_index_presence": {
      const ix = access.index_presence ?? {};
      const states = [ix.bing?.indexed, ix.brave?.indexed]; // google recorded, unscored in v1 surfaces
      if (states.includes(false)) return { score: 0, rationale: `absent from a gating index (bing=${ix.bing?.indexed}, brave=${ix.brave?.indexed})` };
      if (states.every((v) => v === true)) return { score: 5, rationale: "present in Bing and Brave" };
      // Unknown is not a gap: an indeterminate check must not generate fix priority.
      return { score: 3, indeterminate: true, rationale: `present where determinable, others indeterminate (bing=${ix.bing?.indexed}, brave=${ix.brave?.indexed}) — verify before prescribing` };
    }
    case "fetchability_no_js": {
      const ps = siteFacts?.elements?.fetchability_no_js?.facts ?? [];
      if (!ps.length) return null;
      const live = ps.filter((p) => p.status === 200);
      const shells = live.filter((p) => p.spa_shell);
      const noBrand = live.filter((p) => !p.brand_in_raw);
      const thin = live.filter((p) => p.text_chars < 800);
      let s = 5; const why = [];
      if (shells.length) { s -= 3; why.push(`SPA shell on ${shells.length} page(s)`); }
      if (noBrand.length) { s -= 1.5; why.push(`brand absent from raw text on ${noBrand.length} page(s)`); }
      else if (thin.length > live.length / 2) { s -= 1; why.push(`thin raw text on ${thin.length}/${live.length} pages`); }
      return { score: clamp(s), rationale: why.length ? why.join("; ") : `full raw-HTML parity signals across ${live.length} sampled pages` };
    }
    case "crawl_coverage": {
      const f = siteFacts?.elements?.crawl_coverage?.facts;
      if (!f) return null;
      let s = 5; const why = [];
      const robotsValid = access?.robots?.valid ?? false;
      if (!f.sitemap_real) { s -= 1.5; why.push("no real XML sitemap"); }
      if (!robotsValid) { s -= 1; why.push("no valid robots.txt (no crawl map pointer)"); }
      const [c, n] = (f.canonical_on_sample ?? "0/1").split("/").map(Number);
      if (n && c / n < 0.5) { s -= 1; why.push(`canonical on only ${f.canonical_on_sample} sampled pages`); }
      if (f.homepage_og_type && !/website|organization/i.test(f.homepage_og_type)) { s -= 0.5; why.push(`homepage og:type=${f.homepage_og_type}`); }
      if (!f.about_page) { s -= 0.5; why.push("no about page discoverable from nav"); }
      return { score: clamp(s), rationale: why.length ? why.join("; ") : "sitemap + canonicals + navigable structure all present" };
    }
    case "entity_schema": {
      const ps = siteFacts?.elements?.entity_schema?.facts ?? [];
      if (!ps.length) return null;
      const types = new Set(ps.flatMap((p) => p.ld_types));
      const sameAs = ps.reduce((a, p) => a + (p.sameAs_count || 0), 0);
      const has = (t) => [...types].some((x) => x.toLowerCase().includes(t));
      let s = 0;
      if (types.size) s = 2;
      if (has("organization")) s = 3;
      if (has("organization") && sameAs > 0) s = 4;
      if (has("organization") && sameAs > 0 && (has("person") || has("product") || has("article") || has("faqpage"))) s = 5;
      return { score: s, rationale: types.size ? `types on sample: ${[...types].join(", ")}; sameAs links: ${sameAs}` : "zero JSON-LD on the sampled pages" };
    }
    default: return null;
  }
}

// ---- judged scorer ----
const parseJSON = (text) => {
  const cleaned = String(text).replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const s = cleaned.search(/[{[]/);
  const e = cleaned.lastIndexOf("}");
  if (s === -1 || e < s) throw new Error("no JSON in judge output");
  return JSON.parse(cleaned.slice(s, e + 1));
};
// Fold smart punctuation (curly quotes, apostrophes, dashes) to ASCII so a verbatim
// evidence quote isn't rejected over a ' vs ' style difference.
const norm = (s) => String(s).toLowerCase()
  .replace(/[‘’′]/g, "'").replace(/[“”″]/g, '"').replace(/[–—]/g, "-")
  .replace(/\s+/g, " ").trim();

function extraInputs(id) {
  switch (id) {
    case "branded_faq":
      return { assessment_questions: prompts.filter((p) => p.track === "assessment").map((p) => p.text) };
    case "name_binding": {
      const assess = graded.filter((r) => r.track === "assessment");
      const flagged = assess.filter((r) => (r.flags ?? []).some((f) => /wrong_entity|conflat/i.test(f)));
      return { audit_wrong_entity: { rate: `${flagged.length} of ${assess.length} assessment answers flagged wrong_entity/conflation`, rows: flagged.map((r) => ({ prompt_id: r.prompt_id, surface: r.surface, note: (r.rationale ?? "").slice(0, 200) })) } };
    }
    case "comparison_pages": {
      const sov = consideration?.judgments?.filter((j) => j.in_category)?.map((j) => j.name) ?? [];
      return { real_rivals_from_answers: sov, prep_competitors: (ctx.competitors ?? []).map((c) => c.name) };
    }
    case "review_sites":
      return { resolved_sources: [...new Set(profiles.flatMap((p) => VALIDATION_SOURCES[p] ?? []))] };
    case "pricing_transparency":
      return { profile_meaning: profiles[0] === "enterprise_b2b" ? "pricing-model clarity (enterprise)" : profiles[0] === "plg_saas" ? "public parseable numbers" : "judge per anchors for primary profile " + profiles[0] };
    default: return {};
  }
}

async function judgeScore(el, facts) {
  const extras = extraInputs(el.id);
  const factsBlob = JSON.stringify({ facts, ...extras }, null, 1).slice(0, 14000);
  const prompt = `You are scoring ONE element of an AEO/GEO audit against a fixed anchored rubric. Company: ${ctx.company} (${ctx.domain}). Audit profile: ${profiles.join(" + ")}. Category terms: ${(ctx.category_terms ?? []).slice(0, 6).join(", ")}.

ELEMENT: ${el.id}
ANCHORS (score strictly against these):
${el.anchors}

FROZEN FACTS (the only evidence you may use; do not assume anything not present here):
${factsBlob}

Rules: choose the integer 0-5 whose anchor best matches the facts. If facts are thin or marked directional/fallback, do not award extreme scores without support. Provide 1-3 evidence quotes COPIED VERBATIM from the facts above. No em dashes anywhere in your output. Your FIRST reasoning sentence must stand alone as a complete deck-ready summary of the verdict in under 110 characters and end with a period (it is printed verbatim in a fixed two-line deck cell; do not exceed 110 or it gets truncated; later sentences carry the detail).

Return ONLY JSON: {"reasoning": "<2-4 sentences against the anchors; sentence 1 = standalone summary, complete, under 110 chars>", "score": <0-5 integer>, "evidence": ["<verbatim substring of the facts>", ...]}`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { text } = await complete(prompt, { model: JUDGE_MODEL, max_tokens: 1200 });
      const out = parseJSON(text);
      const score = Number(out.score);
      if (!Number.isInteger(score) || score < 0 || score > 5) throw new Error(`bad score ${out.score}`);
      const hay = norm(factsBlob);
      const evidence = [].concat(out.evidence ?? []).filter((q) => typeof q === "string" && q.length > 5);
      const valid = evidence.length > 0 && evidence.every((q) => hay.includes(norm(q).slice(0, 180)));
      if (!valid && attempt === 1) continue; // retry once on evidence failure
      return { score, rationale: String(out.reasoning ?? "").replace(/—/g, ", "), evidence, evidence_validated: valid, needs_review: !valid };
    } catch (e) {
      if (attempt === 2) return { score: null, rationale: `judge failed: ${e.message}`, evidence: [], evidence_validated: false, needs_review: true };
    }
  }
}

// ---- run ----
const result = {
  slug, company: ctx.company, profile: ctx.audit_profile,
  judge_model: JUDGE_MODEL, scored_at: new Date().toISOString(),
  levers: { access: { elements: {} }, identity: { elements: {} }, content: { elements: {} }, reputation: { elements: {} } },
  not_applicable: [], needs_review: [], missing_facts: [],
};

for (const el of ELEMENTS) {
  if (!applicable(el, profiles)) { result.not_applicable.push(el.id); continue; }
  let scored;
  if (el.id === "content_engine") {
    const facts = siteFacts?.elements?.content_engine?.facts ?? null;
    if (!facts || !facts.posts?.length) { result.missing_facts.push(el.id); continue; }
    process.stdout.write(`scoring content_engine ... `);
    scored = { ...(await scoreContentEngine({ facts, ctx, profiles, complete, model: JUDGE_MODEL })), basis: "composite" };
    const f = scored.facets ?? {};
    console.log(scored.score === null ? "FAILED" : `${scored.score}/5 [freq${f.frequency} persp${f.original_perspective} icp${f.icp_fit} byl${f.bylines} struct${f.structure} show${f.show_dont_tell}]${scored.needs_review ? " (needs review)" : ""}`);
    if (scored.needs_review) result.needs_review.push(el.id);
  } else if (el.check === "mech") {
    scored = mechScore(el.id);
    if (!scored) { result.missing_facts.push(el.id); continue; }
    scored = { ...scored, basis: "mechanical" };
  } else {
    const src = FACTS_SOURCE[el.id] === "onsite" ? onsite : offsite;
    const facts = src?.elements?.[el.id] ?? siteFacts?.elements?.[el.id] ?? null;
    if (!facts) { result.missing_facts.push(el.id); continue; }
    process.stdout.write(`judging ${el.id} ... `);
    scored = { ...(await judgeScore(el, facts)), basis: "judged" };
    console.log(scored.score === null ? "FAILED" : `${scored.score}/5${scored.needs_review ? " (needs review)" : ""}`);
    if (scored.needs_review) result.needs_review.push(el.id);
  }
  result.levers[el.lever].elements[el.id] = { job: el.job, tier: el.tier, ...scored };
}

// rollups: lever means + the two job rollups (gate counts toward both)
const scoredEls = [];
for (const [lever, obj] of Object.entries(result.levers)) {
  const vals = Object.values(obj.elements).map((e) => e.score).filter((s) => Number.isInteger(s));
  obj.score = vals.length ? round1(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  for (const [id, e] of Object.entries(obj.elements)) scoredEls.push({ id, ...e });
}
const jobMean = (pred) => {
  const vals = scoredEls.filter(pred).map((e) => e.score).filter((s) => Number.isInteger(s));
  return vals.length ? round1(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
};
result.jobs = {
  discoverability_levers: jobMean((e) => ["disc", "both", "gate"].includes(e.job)),
  assessment_levers: jobMean((e) => ["assess", "both", "gate"].includes(e.job)),
};

// risk register: low community/press scores with negative narratives surface here via offsite facts
result.risk_register = (offsite?.risk_register ?? []).concat(
  scoredEls.filter((e) => e.score === 0 || e.score === 1)
    .filter((e) => ["reddit", "community_forums", "review_sites"].includes(e.id))
    .map((e) => ({ source: e.id, note: e.rationale }))
);

result.framework_version = FRAMEWORK_VERSION;
result.rubric_version = RUBRIC_VERSION;

await writeFile(`${dir}/levers.json`, JSON.stringify(result, null, 2) + "\n");
console.log(`\nlevers (scores) -> ${dir}/levers.json`);
for (const [lever, obj] of Object.entries(result.levers)) {
  console.log(`${lever}: ${obj.score ?? "n/a"}  [${Object.entries(obj.elements).map(([id, e]) => `${id} ${e.score ?? "?"}`).join(", ")}]`);
}
console.log(`jobs: disc-levers ${result.jobs?.discoverability_levers} | assess-levers ${result.jobs?.assessment_levers}`);
if (result.not_applicable?.length) console.log(`n/a (profile): ${result.not_applicable.join(", ")}`);
if (result.missing_facts?.length) console.log(`missing facts: ${result.missing_facts.join(", ")}`);
if (result.needs_review?.length) console.log(`needs review: ${result.needs_review.join(", ")}`);
console.log(`\nnext: node score-importance.mjs ${slug}`);
