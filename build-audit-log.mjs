// Audit Log exporter — the Gate-2 data artifact. Joins the importance matrix
// (one row per element x job) with the strategist's fixes and emits the Notion
// row payloads for the AEO Audit Log database. Each element row carries its audit
// score + importance matrix; rows whose element is a fix's primary (or appears in
// a fix's `covers`) also carry the fix columns + a Fix rank. Nothing is filtered out.
//
// Writes companies/<slug>/audit-log.json — an array of { properties: {...} } ready
// for one notion-create-pages call (the /audit-run Notion step pushes it).
//   node build-audit-log.mjs <slug>

import { readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const slug = process.argv[2];
if (!slug) throw new Error("usage: node build-audit-log.mjs <slug>");
const root = dirname(fileURLToPath(import.meta.url));
const dir = `${root}/companies/${slug}`;
const load = async (f) => JSON.parse(await readFile(`${dir}/${f}`, "utf8"));

const ctx = await load("context.json");
const importance = await load("importance.json");
const levers = await load("levers.json");
const fixes = (await load("fixes.json").catch(() => null)) ?? { fixes: [] };

const company = ctx.company ?? slug;
const clean = (s) => String(s ?? "").replace(/[—–]/g, ", ").replace(/\s*--\s*/g, ", ").trim();

// element id -> { basis, rationale } from the scored levers.json
const elMeta = {};
for (const obj of Object.values(levers.levers ?? {})) {
  for (const [id, e] of Object.entries(obj.elements ?? {})) elMeta[id] = { basis: e.basis ?? null, rationale: e.rationale ?? "" };
}

// element id -> fix, split into primary (fix.element) and covered (fix.covers[])
const primaryFix = {}, coveredFix = {};
for (const f of (fixes.fixes ?? [])) {
  if (f.element) primaryFix[f.element] = f;
  for (const c of (f.covers ?? [])) if (!primaryFix[c]) coveredFix[c] = f;
}

const yn = (b) => (b ? "__YES__" : "__NO__");
const rows = importance.matrix.map((r) => {
  const meta = elMeta[r.dimension] ?? {};
  const p = { properties: {
    "Element": r.dimension,
    "Company": company,
    "Lever": r.lever,
    "Job": r.job,
    "Tier": r.tier,
    "Basis": meta.basis ?? "",
    "Research importance": r.research_importance,
    "Run importance": r.run_importance,
    "Blended importance": r.blended_importance,
    "Verify first": yn((r.flags ?? []).includes("verify_first")),
    "Needs review": yn((r.flags ?? []).includes("needs_review")),
  }};
  if (r.audit_score != null) p.properties["Audit score"] = r.audit_score;
  if (r.gap != null) p.properties["Gap"] = r.gap;
  if (r.priority != null) p.properties["Priority"] = r.priority;
  if (meta.rationale) p.properties["Score rationale"] = clean(meta.rationale).slice(0, 1800);

  const pf = primaryFix[r.dimension];
  const cf = coveredFix[r.dimension];
  if (pf) {
    p.properties["Fix rank"] = pf.rank;
    p.properties["Fix title"] = clean(pf.title);
    p.properties["Fix action"] = clean(pf.how).slice(0, 1800);
    p.properties["Fix rationale"] = clean(pf.why).slice(0, 1800);
    if (pf.metric_moved) p.properties["Metric moved"] = clean(pf.metric_moved);
    if (pf.effort) p.properties["Effort"] = pf.effort;
  } else if (cf) {
    p.properties["Fix rank"] = cf.rank;
    p.properties["Fix title"] = clean(cf.title);
    p.properties["Fix action"] = `Rolled into fix ${cf.rank}: ${clean(cf.title)}`;
  }
  return p;
});

await writeFile(`${dir}/audit-log.json`, JSON.stringify(rows, null, 2) + "\n");
const withFix = rows.filter((r) => r.properties["Fix rank"] != null).length;
console.log(`audit-log -> ${dir}/audit-log.json  (${rows.length} element rows, ${withFix} carry a fix)`);
const ranked = rows.filter((r) => r.properties["Fix rank"] != null).sort((a, b) => a.properties["Fix rank"] - b.properties["Fix rank"]);
for (const r of ranked) console.log(`  fix ${r.properties["Fix rank"]}: ${r.properties.Element} (${r.properties.Job})${primaryFix[r.properties.Element] ? "" : " [covered]"}`);
