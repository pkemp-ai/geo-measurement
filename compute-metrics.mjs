// Metric compute — deterministic, key-free. Aggregates classified rows into the
// three axes per track + per surface, discoverability share-of-voice, and top
// cited domains per track.
//
//   node audit/compute-metrics.mjs northwind

import { readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const company = process.argv[2];
if (!company) throw new Error("usage: node audit/compute-metrics.mjs <slug>");
const root = dirname(fileURLToPath(import.meta.url));
const dir = `${root}/companies/${company}`;

const rows = (await readFile(`${dir}/classified.jsonl`, "utf8"))
  .split("\n").filter(Boolean).map((l) => JSON.parse(l));

const round = (x) => Math.round(x * 100) / 100;
const rate = (arr, pred) => (arr.length ? round(arr.filter(pred).length / arr.length) : 0);
const summarize = (s) => ({
  n: s.length,
  mention_rate: rate(s, (r) => r.brand_mentioned),
  citation_rate: rate(s, (r) => r.own_domain_cited),
});

// Which domains models actually pull for a track, ranked by how many answers cited them.
const topCitedDomains = (trackRows) => {
  const counts = new Map();
  for (const r of trackRows) {
    const seen = new Set();
    for (const c of r.citations ?? []) {
      const h = c.host;
      if (!h || seen.has(h)) continue;
      seen.add(h);
      const cur = counts.get(h) ?? { host: h, source_type: c.source_type, n_answers: 0 };
      cur.n_answers += 1;
      counts.set(h, cur);
    }
  }
  const n = trackRows.length || 1;
  return [...counts.values()]
    .map((d) => ({ ...d, rate: round(d.n_answers / n) }))
    .sort((a, b) => b.n_answers - a.n_answers);
};

const tracks = ["discoverability", "assessment"];
const surfaces = [...new Set(rows.map((r) => r.surface))];

const metrics = { by_track: {}, by_track_surface: {}, share_of_voice: {} };
for (const t of tracks) {
  const tr = rows.filter((r) => r.track === t);
  metrics.by_track[t] = summarize(tr);
  metrics.by_track_surface[t] = Object.fromEntries(
    surfaces.map((s) => [s, summarize(tr.filter((r) => r.surface === s))])
  );
}

const disc = rows.filter((r) => r.track === "discoverability");
const sov = {};
// Prefer the answer-derived, category-gated consideration set (classify.mjs
// Stage B); fall back to pre-listed competitors for older classified.jsonl.
for (const r of disc) for (const c of r.consideration_set ?? r.competitors_mentioned ?? []) sov[c] = (sov[c] ?? 0) + 1;
metrics.share_of_voice = {
  brand: disc.filter((r) => r.brand_mentioned).length,
  competitors: sov,
  n_discoverability: disc.length,
};

metrics.top_cited_domains = Object.fromEntries(
  tracks.map((t) => [t, topCitedDomains(rows.filter((r) => r.track === t))])
);

// Comparison double-click metrics (framework v2.3). prompts.json tags the two
// comparison prompts with is_comparison + named_rival. The discovery half
// (alternatives) measures whether the brand surfaces when the buyer names the
// rival; the assessment half (head-to-head) is aggregated from graded.jsonl below.
let promptMeta = new Map();
try {
  const prompts = JSON.parse(await readFile(`${dir}/prompts.json`, "utf8"));
  for (const p of prompts) promptMeta.set(p.id, { is_comparison: p.is_comparison === true, named_rival: p.named_rival ?? null, track: p.track });
} catch {}
const isCmp = (id) => promptMeta.get(id)?.is_comparison === true;
const altRows = rows.filter((r) => r.track === "discoverability" && isCmp(r.prompt_id));
metrics.comparison = {
  alternatives_capture: altRows.length
    ? { n: altRows.length, capture_rate: rate(altRows, (r) => r.brand_mentioned),
        rival: [...new Set(altRows.map((r) => promptMeta.get(r.prompt_id)?.named_rival).filter(Boolean))] }
    : null,
  head_to_head: null, // filled from graded.jsonl in the performance block
};

// Per-prompt mention counts (k of n) — the honest per-prompt unit now that
// prompts run k times per surface. Percentages live at the pooled level only.
metrics.per_prompt_mentions = {};
for (const r of rows) {
  const p = (metrics.per_prompt_mentions[r.prompt_id] ??= { total: { k: 0, n: 0 } });
  const s = (p[r.surface] ??= { k: 0, n: 0 });
  s.n++; p.total.n++;
  if (r.brand_mentioned) { s.k++; p.total.k++; }
}

// Performance aggregates (from graded.jsonl when present). Two numbers per
// track, never one: blended_avg keeps floor failures in (comparable to the old
// score); portrayal_when_named averages only rows where the brand actually
// appeared with the right entity — the quality axis, orthogonal to mention rate.
try {
  const graded = (await readFile(`${dir}/graded.jsonl`, "utf8"))
    .split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const round1 = (x) => Math.round(x * 10) / 10;
  const avg = (a) => (a.length ? round1(a.reduce((s, x) => s + x, 0) / a.length) : null);
  // Pre-upgrade graded.jsonl has no portrayal_eligible; approximate it.
  const eligible = (r) => r.portrayal_eligible ?? (r.performance_score > 0 && !(r.flags ?? []).includes("wrong_entity"));
  const block = (rs) => ({
    n: rs.length,
    blended_avg: avg(rs.map((r) => r.performance_score)),
    portrayal_when_named: avg(rs.filter(eligible).map((r) => r.performance_score)),
    n_named: rs.filter(eligible).length,
  });
  metrics.performance = {};
  for (const t of tracks) {
    const tr = graded.filter((r) => r.track === t);
    metrics.performance[t] = block(tr);
    metrics.performance[`${t}_by_surface`] = Object.fromEntries(
      surfaces.map((s) => [s, block(tr.filter((r) => r.surface === s))])
    );
  }

  // Which approved criteria fail most when the brand IS in the answer — the
  // mechanical finding source ("the check that fails everywhere is X").
  let criterionText = new Map();
  try {
    const prompts = JSON.parse(await readFile(`${dir}/prompts.json`, "utf8"));
    for (const p of prompts) for (const [i, c] of (p.success_criteria ?? []).entries()) {
      if (typeof c === "string") criterionText.set(`${p.id}.c${i + 1}`, c);
      else if (c.id) criterionText.set(c.id, c.text);
    }
  } catch {}
  const cf = new Map();
  for (const r of graded.filter(eligible)) for (const c of r.criteria ?? []) {
    const cur = cf.get(c.id) ?? { id: c.id, text: criterionText.get(c.id) ?? null, pass: 0, partial: 0, fail: 0, missing: 0, n: 0 };
    cur[c.verdict] = (cur[c.verdict] ?? 0) + 1;
    cur.n++;
    cf.set(c.id, cur);
  }
  metrics.criterion_failures = [...cf.values()]
    .map((c) => ({ ...c, fail_rate: c.n ? Math.round(((c.fail + c.missing + 0.5 * c.partial) / c.n) * 100) / 100 : 0 }))
    .sort((a, b) => b.fail_rate - a.fail_rate);

  // Head-to-head win-rate from the graded comparison rows (assessment double-click).
  const h2hRows = graded.filter((r) => r.head_to_head && isCmp(r.prompt_id));
  if (h2hRows.length) {
    const tally = { win: 0, tie: 0, loss: 0 };
    for (const r of h2hRows) tally[r.head_to_head.verdict] = (tally[r.head_to_head.verdict] ?? 0) + 1;
    const decided = tally.win + tally.tie + tally.loss;
    metrics.comparison.head_to_head = {
      n: h2hRows.length, ...tally,
      win_rate: decided ? round(tally.win / decided) : null,
      rival: [...new Set(h2hRows.map((r) => r.head_to_head.rival).filter(Boolean))],
      by_surface: Object.fromEntries(surfaces.map((s) => {
        const sr = h2hRows.filter((r) => r.surface === s);
        return [s, sr.length ? sr.map((r) => r.head_to_head.verdict) : undefined];
      }).filter(([, v]) => v)),
    };
  }

  let queue = [];
  try { queue = JSON.parse(await readFile(`${dir}/review-queue.json`, "utf8")); } catch {}
  metrics.grading = {
    rubric_version: graded[0]?.rubric_version ?? null,
    judge_model: graded[0]?.judge_model ?? null,
    rows: graded.length,
    needs_review: queue.length,
  };
} catch {} // no graded.jsonl yet — metrics still valid for the classify-only stage

await writeFile(`${dir}/metrics.json`, JSON.stringify(metrics, null, 2));
console.log(`metrics -> ${dir}/metrics.json`);
console.log(JSON.stringify(metrics.by_track, null, 2));
if (metrics.performance) console.log(JSON.stringify(metrics.performance, null, 2));
