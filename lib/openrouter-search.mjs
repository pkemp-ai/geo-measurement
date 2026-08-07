// OpenRouter-backed web search — the scripted, reproducible link-discovery
// helper for the facts-ledger checks (listicle/roundup discovery,
// third_party_mentions). Replaces the retired DataForSEO client: one bill and
// one key (OPENROUTER_API_KEY — the same key the surfaces under test use).
//
// Mechanics: a chat completion on a pinned cheap model with the OpenRouter web
// plugin forced to the Exa engine (provider-agnostic, explicit max_results).
// We read the url_citation annotations, not the completion text — the model is
// only the vehicle for the search. Temp 0, tiny max_tokens.
//
// Reproducibility contract (unchanged from the DataForSEO version): a recorded
// query + date returns a comparable result set; result-level jitter is the
// same class as SERP drift. When OPENROUTER_API_KEY is absent every call
// returns null and the caller records the degraded method in the facts ledger
// (agent_search_fallback, disclosed as directional).
//
// Costs at 2026-08: Exa results bill $4/1000 through the plugin -> ~$0.04 per
// 10-result query, plus a negligible completion. A full offsite sweep (~30
// queries) runs ~$1-2.
//
// CLI (for the offsite-evidence agent / ad-hoc probes; prints JSON):
//   node lib/openrouter-search.mjs serp "best <category> tool" [n]
//   node lib/openrouter-search.mjs mention "<brand>" [n]

import { pathToFileURL } from "node:url";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const SEARCH_MODEL = "openai/gpt-5-mini"; // pinned; the completion text is discarded
const MAX_RESULTS_CAP = 25;
const MAX_ATTEMPTS = 3;

export function searchAvailable() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// Retries on 429 / 5xx with a linear backoff — a rate-limited sweep should slow
// down, not silently lose an element's evidence.
async function webSearch(query, maxResults) {
  if (!searchAvailable()) return null;
  let lastErr;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://lobogrowth.com",
          "X-Title": "Lobo Growth AEO Audit",
        },
        body: JSON.stringify({
          model: SEARCH_MODEL,
          messages: [{
            role: "user",
            content: `Search the web for: ${query}\nReply with the single word "done".`,
          }],
          temperature: 0,
          max_tokens: 100,
          plugins: [{ id: "web", engine: "exa", max_results: maxResults }],
        }),
      });
      if (res.status === 429 || res.status >= 500) throw new Error(`OpenRouter search -> retryable ${res.status}`);
      if (!res.ok) throw new Error(`OpenRouter search -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      const msg = data.choices?.[0]?.message ?? {};
      return (msg.annotations ?? [])
        .filter((a) => a?.type === "url_citation" && a.url_citation)
        .map((a) => ({
          url: a.url_citation.url ?? "",
          title: a.url_citation.title ?? "",
          snippet: (a.url_citation.content ?? "").slice(0, 300),
        }));
    } catch (e) {
      lastErr = e;
      if (attempt < MAX_ATTEMPTS - 1) await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }
  throw lastErr;
}

// SERP-style discovery for one query. Returns [{title, url, domain, position}]
// or null (no key). Position is result order, not a Google rank.
export async function serpSearch(query, opts = {}) {
  const hits = await webSearch(query, Math.min(opts.depth ?? 10, MAX_RESULTS_CAP));
  if (!hits) return null;
  return hits.map((h, i) => ({ title: h.title, url: h.url, domain: domainOf(h.url), position: i + 1 }));
}

// Brand-mention discovery. Returns { total_count, items: [{url, domain, date,
// snippet, sentiment}] } or null. total_count is just items.length (no web
// index behind it — treat as directional); date/sentiment stay null, the
// scorer already handles their absence.
export async function mentionSearch(keyword, opts = {}) {
  const hits = await webSearch(`"${keyword}"`, Math.min(opts.limit ?? 20, MAX_RESULTS_CAP));
  if (!hits) return null;
  const items = hits.map((h) => ({ url: h.url, domain: domainOf(h.url), date: null, snippet: h.snippet, sentiment: null }));
  return { total_count: items.length, items };
}

// --- CLI ---
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [mode, query, n] = process.argv.slice(2);
  if (!["serp", "mention"].includes(mode) || !query) {
    console.error('usage: node lib/openrouter-search.mjs serp|mention "<query>" [n]');
    process.exit(1);
  }
  if (!searchAvailable()) {
    console.error("OPENROUTER_API_KEY not set — fall back to agent search and record method: agent_search_fallback");
    process.exit(1);
  }
  const num = n ? Number(n) : undefined;
  const run = mode === "serp" ? serpSearch(query, { depth: num }) : mentionSearch(query, { limit: num });
  run
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((err) => { console.error(err.message); process.exit(1); });
}
