// Metric compute — deterministic, key-free. Aggregates classified rows into the
// three axes per track + per surface, discoverability share-of-voice, and top
// cited domains per track.
//
//   node compute-metrics.mjs northwind

import { readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const company = process.argv[2];
if (!company) throw new Error("usage: node compute-metrics.mjs <slug>");
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
for (const r of disc) for (const c of r.competitors_mentioned ?? []) sov[c] = (sov[c] ?? 0) + 1;
metrics.share_of_voice = {
  brand: disc.filter((r) => r.brand_mentioned).length,
  competitors: sov,
  n_discoverability: disc.length,
};

metrics.top_cited_domains = Object.fromEntries(
  tracks.map((t) => [t, topCitedDomains(rows.filter((r) => r.track === t))])
);

await writeFile(`${dir}/metrics.json`, JSON.stringify(metrics, null, 2));
console.log(`metrics -> ${dir}/metrics.json`);
console.log(JSON.stringify(metrics.by_track, null, 2));
