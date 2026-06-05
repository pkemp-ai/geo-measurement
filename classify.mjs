// Citation classifier — deterministic, key-free. Adds per-row analysis to the
// raw tester output: was the brand named, was its own domain cited, which
// competitors appeared, and a source-type tag per citation. Local files only.
//
// brand_mentioned is a NAME string-match — it can't tell a wrong-entity answer
// (a different "Atlas") from the real brand. The performance grader is
// authoritative on correct entity; the insights stager reconciles the two.
//
//   node classify.mjs northwind
//
// Validate the citation shape against the first live tester run — this assumes
// citations are [{ url, title }] per lib/openrouter.mjs.

import { readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const company = process.argv[2];
if (!company) throw new Error("usage: node classify.mjs <slug>");
const root = dirname(fileURLToPath(import.meta.url));
const dir = `${root}/companies/${company}`;

const ctx = JSON.parse(await readFile(`${dir}/context.json`, "utf8"));
const rows = (await readFile(`${dir}/raw_responses.jsonl`, "utf8"))
  .split("\n").filter(Boolean).map((l) => JSON.parse(l));

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
function sourceType(h) {
  if (!h) return "other";
  if (brandHost && (h === brandHost || h.endsWith("." + brandHost))) return "own_domain";
  for (const [re, t] of TYPE_RULES) if (re.test(h)) return t;
  if (compHosts.has(h)) return "competitor";
  return "press_or_other";
}

const out = rows.map((r) => {
  const text = r.response ?? "";
  const citations = (r.citations ?? []).map((c) => {
    const h = host(c.url);
    return { ...c, host: h, source_type: sourceType(h) };
  });
  return {
    ...r,
    brand_mentioned: named(text, brandNames),
    own_domain_cited: citations.some((c) => c.source_type === "own_domain"),
    competitors_mentioned: competitors.map((c) => c.name).filter((n) => named(text, [n])),
    citations,
  };
});

await writeFile(`${dir}/classified.jsonl`, out.map((r) => JSON.stringify(r)).join("\n") + "\n");
console.log(`classified ${out.length} rows -> ${dir}/classified.jsonl`);
