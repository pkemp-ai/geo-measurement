// DataForSEO client — SERP + Content Analysis, pay-as-you-go. Used by the
// facts-ledger checks (listicles roundup discovery, third_party_mentions) for
// reproducibility: a recorded query + date returns a stable result set, where
// freeform agent search jitters run-to-run.
//
// Credentials: DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD env vars. When absent,
// every call returns null and the caller records the degraded method in the
// facts ledger (agent-search fallback, disclosed as directional). Costs at
// 2026-06: SERP live $0.002/query, Content Analysis ~$0.05/full pull.

const BASE = "https://api.dataforseo.com/v3";

export function dfsAvailable() {
  return Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
}

async function post(path, payload) {
  if (!dfsAvailable()) return null;
  const auth = Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString("base64");
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`DataForSEO ${path} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const task = data.tasks?.[0];
  if (!task || task.status_code >= 40000) throw new Error(`DataForSEO task error: ${task?.status_message ?? "no task"}`);
  return task.result ?? null;
}

// Live Google organic SERP for one query. Returns [{title, url, domain, position}] or null (no creds).
export async function serpSearch(query, opts = {}) {
  const result = await post("/serp/google/organic/live/regular", [{
    keyword: query,
    language_code: opts.language ?? "en",
    location_code: opts.location ?? 2840, // United States
    depth: opts.depth ?? 20,
  }]);
  if (!result) return null;
  const items = result[0]?.items ?? [];
  return items
    .filter((i) => i.type === "organic")
    .map((i) => ({ title: i.title ?? "", url: i.url ?? "", domain: i.domain ?? "", position: i.rank_absolute ?? null }));
}

// Content Analysis search: brand mention discovery + sentiment across the web.
// Returns { total_count, items: [{url, domain, date, snippet, sentiment}] } or null.
export async function mentionSearch(keyword, opts = {}) {
  const result = await post("/content_analysis/search/live", [{
    keyword,
    search_mode: "as_is",
    limit: opts.limit ?? 100,
  }]);
  if (!result) return null;
  const r = result[0] ?? {};
  const items = (r.items ?? []).map((i) => ({
    url: i.url ?? "",
    domain: i.domain ?? "",
    date: i.content_info?.publication_date ?? null,
    snippet: (i.content_info?.snippet ?? "").slice(0, 300),
    sentiment: i.content_info?.sentiment_connotations ?? null,
  }));
  return { total_count: r.total_count ?? items.length, items };
}
