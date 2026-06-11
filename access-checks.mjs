// AEO/GEO audit — AI-crawler access + index-presence checks. Deterministic,
// key-free, no deps, native fetch. Writes companies/<slug>/access.json.
//
// Covers the three binary failure modes that silently kill AI-search visibility
// and that a freeform crawl pass misses or measures inconsistently:
//   1. robots.txt rules per bot CLASS — training (GPTBot/ClaudeBot/CCBot) vs
//      search-index (OAI-SearchBot/Claude-SearchBot/PerplexityBot/Googlebot) vs
//      user-fetch (ChatGPT-User/Perplexity-User). Blocking GPTBot but allowing
//      OAI-SearchBot keeps ChatGPT-search visibility; the classes are not one bit.
//      Also flags when /robots.txt is not a real file (an SPA/HTML 404 — the
//      SPA-404 case — means no crawl map and no sitemap pointer).
//   2. UA probes — does the live origin / CDN / WAF actually answer each AI bot
//      user-agent, or 403/challenge it while serving a browser? Cloudflare blocks
//      AI bots by default for new domains (since Jul 2025), so a site can be
//      robots-clean and still hard-blocked at the edge.
//   3. Index presence — is the domain in BING (the ChatGPT-search gate) and BRAVE
//      (the Claude-search gate)? Two indexes independent of Google that a brand
//      never checks. Brave is reliable only with BRAVE_SEARCH_API_KEY set (free
//      tier); without it the check is best-effort HTML and may report "unknown".
//
//   node access-checks.mjs <slug> [domain-override]
//
// Emits a deterministic access_score (0-5) with an anchored rationale, so the
// site crawler consumes these facts rather than re-deriving them per run.

import { readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const slug = process.argv[2];
if (!slug) throw new Error("usage: node access-checks.mjs <slug> [domain]");
const root = dirname(fileURLToPath(import.meta.url));
const dir = `${root}/companies/${slug}`;

const ctx = JSON.parse(await readFile(`${dir}/context.json`, "utf8"));
const domain = (process.argv[3] || ctx.domain || "")
  .replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").trim();
if (!domain) throw new Error("no domain in context.json and none passed");

const TIMEOUT = 15000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CONTROL_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Bot universe for robots.txt parsing. [token, class, vendor]. class drives scoring:
// search/user gate live visibility; training is a defensible opt-out, not a block.
const BOTS = [
  ["GPTBot", "training", "openai"],
  ["OAI-SearchBot", "search", "openai"],
  ["ChatGPT-User", "user", "openai"],
  ["OAI-AdsBot", "ads", "openai"],
  ["ClaudeBot", "training", "anthropic"],
  ["anthropic-ai", "training", "anthropic"],
  ["Claude-SearchBot", "search", "anthropic"],
  ["Claude-User", "user", "anthropic"],
  ["PerplexityBot", "search", "perplexity"],
  ["Perplexity-User", "user", "perplexity"],
  ["Googlebot", "search", "google"],
  ["Google-Extended", "training", "google"],
  ["Bingbot", "search", "microsoft"],
  ["Applebot-Extended", "training", "apple"],
  ["CCBot", "training", "commoncrawl"],
  ["Amazonbot", "search", "amazon"],
  ["Meta-ExternalAgent", "training", "meta"],
  ["Bytespider", "training", "bytedance"],
];
const botClass = (name) => BOTS.find((b) => b[0] === name)?.[1] ?? "other";

// Subset probed live with a real UA (8 requests). Realistic current UA strings.
const PROBES = [
  ["control", CONTROL_UA],
  ["GPTBot", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot"],
  ["OAI-SearchBot", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot"],
  ["ChatGPT-User", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot"],
  ["ClaudeBot", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ClaudeBot/1.0; +claudebot@anthropic.com"],
  ["Claude-SearchBot", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; Claude-SearchBot/1.0; +https://www.anthropic.com/claude-searchbot"],
  ["PerplexityBot", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot"],
  ["Googlebot", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"],
];

const CHALLENGE_RE =
  /just a moment|cf-chl|challenge-platform|attention required|you have been blocked|__cf_chl|access denied|verify you are (?:a )?human|enable javascript and cookies/i;

// ---- robots.txt parsing (RFC 9309: longest-match wins, allow breaks ties) ----
function parseRobots(text) {
  const groups = [];
  let cur = null, lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const i = line.indexOf(":");
    if (i === -1) continue;
    const field = line.slice(0, i).trim().toLowerCase();
    const value = line.slice(i + 1).trim();
    if (field === "user-agent") {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [], crawlDelay: null }; groups.push(cur); }
      cur.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (field === "allow" || field === "disallow") {
      if (!cur) { cur = { agents: ["*"], rules: [], crawlDelay: null }; groups.push(cur); }
      cur.rules.push({ type: field, path: value });
      lastWasAgent = false;
    } else if (field === "crawl-delay") {
      if (cur) cur.crawlDelay = value;
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function patToRe(pat) {
  let end = false, p = pat;
  if (p.endsWith("$")) { end = true; p = p.slice(0, -1); }
  return new RegExp("^" + p.split("*").map(escRe).join(".*") + (end ? "$" : ""));
}
function ruleMatchLen(pat, path) {
  if (pat === "") return -1; // empty Disallow = no constraint
  try { return patToRe(pat).test(path) ? pat.length : -1; } catch { return -1; }
}
function allowedForPath(group, path) {
  if (!group) return true;
  let bestAllow = -1, bestDis = -1;
  for (const r of group.rules) {
    const len = ruleMatchLen(r.path, path);
    if (len < 0) continue;
    if (r.type === "allow") bestAllow = Math.max(bestAllow, len);
    else bestDis = Math.max(bestDis, len);
  }
  if (bestDis < 0) return true;
  return bestAllow >= bestDis; // tie -> allow (RFC 9309)
}
// Most-specific group: longest agent token that is a prefix of the bot, else "*".
function resolveGroup(groups, token) {
  const t = token.toLowerCase();
  let best = null, bestLen = -1, star = null;
  for (const g of groups) {
    for (const a of g.agents) {
      if (a === "*") { star = g; continue; }
      if (t.startsWith(a) && a.length > bestLen) { best = g; bestLen = a.length; }
    }
  }
  return best || star;
}

async function getRobots() {
  const url = `https://${domain}/robots.txt`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": CONTROL_UA }, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT) });
    const ct = (r.headers.get("content-type") || "").toLowerCase();
    const text = await r.text();
    const looksHtml = /^\s*<(?:!doctype|html)/i.test(text) || ct.includes("text/html");
    const hasDirectives = /^\s*user-agent\s*:/im.test(text);
    const valid = r.ok && hasDirectives && !looksHtml;
    const note = !r.ok
      ? `HTTP ${r.status} — no robots.txt (defaults to allow-all)`
      : looksHtml
      ? "returned HTML, not a real robots.txt (SPA 404 fallback — no crawl map, no sitemap pointer)"
      : !hasDirectives
      ? "no User-agent directives found"
      : "OK";
    return { present: r.ok, valid, status: r.status, content_type: ct, url, text: valid ? text : "", note };
  } catch (e) {
    return { present: false, valid: false, status: null, content_type: "", url, text: "", note: `fetch error: ${e.message}` };
  }
}

async function probe(ua) {
  try {
    const r = await fetch(`https://${domain}/`, {
      headers: { "User-Agent": ua, Accept: "text/html,application/xhtml+xml,*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT),
    });
    let body = "";
    try { body = (await r.text()).slice(0, 8000); } catch {}
    const challenge = CHALLENGE_RE.test(body);
    const blocked = [401, 403, 429, 503].includes(r.status) || challenge;
    return { status: r.status, blocked, challenge, content_type: r.headers.get("content-type") || "", final_url: r.url };
  } catch (e) {
    return { status: null, blocked: true, challenge: false, error: e.message };
  }
}

// ---- index presence ----
function parseBing(html) {
  const low = html.toLowerCase();
  if (CHALLENGE_RE.test(low) || low.includes("captcha")) return { indexed: null, count: null, note: "Bing returned a challenge/CAPTCHA page" };
  if (/there are no results for|<ol id="b_results"[^>]*>\s*<li class="b_no"/i.test(html) || /there are no results for/i.test(low))
    return { indexed: false, count: 0, note: "Bing: no results for site: query" };
  const m = html.match(/sb_count[^>]*>\s*([\d,]+)\s+result/i);
  if (m) return { indexed: true, count: Number(m[1].replace(/,/g, "")), note: `Bing reports ${m[1]} results` };
  const algo = (html.match(/class="b_algo"/g) || []).length;
  if (algo > 0) return { indexed: true, count: null, note: `Bing returned ${algo} organic result block(s)` };
  return { indexed: null, count: null, note: "Bing result shape unrecognized (indeterminate)" };
}
async function bingIndex() {
  const url = `https://www.bing.com/search?q=${encodeURIComponent("site:" + domain)}&count=20&setlang=en-US`;
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": CONTROL_UA, "Accept-Language": "en-US,en;q=0.9", Accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!r.ok) return { indexed: null, count: null, method: "html", note: `Bing HTTP ${r.status}`, evidence: url };
    const html = await r.text();
    return { ...parseBing(html), method: "html", evidence: url };
  } catch (e) {
    return { indexed: null, count: null, method: "html", note: `Bing fetch error: ${e.message}`, evidence: url };
  }
}
async function braveIndex() {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  const q = encodeURIComponent("site:" + domain);
  if (key) {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${q}&count=20`;
    try {
      const r = await fetch(url, { headers: { Accept: "application/json", "X-Subscription-Token": key }, signal: AbortSignal.timeout(TIMEOUT) });
      if (!r.ok) return { indexed: null, count: null, method: "api", note: `Brave API HTTP ${r.status}`, evidence: "api.search.brave.com" };
      const j = await r.json();
      const n = j?.web?.results?.length ?? 0;
      return { indexed: n > 0, count: n, method: "api", note: n > 0 ? `Brave API returned ${n} result(s)` : "Brave API returned 0 results", evidence: "api.search.brave.com" };
    } catch (e) {
      return { indexed: null, count: null, method: "api", note: `Brave API error: ${e.message}`, evidence: "api.search.brave.com" };
    }
  }
  // Keyless best-effort: Brave aggressively challenges automated traffic, so this
  // is usually indeterminate. Set BRAVE_SEARCH_API_KEY (free tier) for a real signal.
  const url = `https://search.brave.com/search?q=${q}`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": CONTROL_UA, "Accept-Language": "en-US,en;q=0.9", Accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT) });
    const html = (await r.text()).slice(0, 20000);
    if (!r.ok || CHALLENGE_RE.test(html)) return { indexed: null, count: null, method: "html", note: "Brave keyless check inconclusive (challenge or non-200); set BRAVE_SEARCH_API_KEY for a reliable result", evidence: url };
    if (/not many great matches|no results found/i.test(html)) return { indexed: false, count: 0, method: "html", note: "Brave: no results for site: query", evidence: url };
    if (/data-type="web"|class="snippet/i.test(html)) return { indexed: true, count: null, method: "html", note: "Brave returned web results", evidence: url };
    return { indexed: null, count: null, method: "html", note: "Brave result shape unrecognized (indeterminate); set BRAVE_SEARCH_API_KEY", evidence: url };
  } catch (e) {
    return { indexed: null, count: null, method: "html", note: `Brave fetch error: ${e.message}; set BRAVE_SEARCH_API_KEY`, evidence: url };
  }
}

// ---- deterministic 0-5 access score (anchored) ----
function scoreAccess(robots, botRules, probes, index) {
  let score = 5;
  const reasons = [];
  if (robots.present && !robots.valid) { score -= 1; reasons.push(`robots.txt is not a real file (${robots.note})`); }
  for (const [bot, info] of Object.entries(botRules)) {
    if (info.allowed) continue;
    if (info.class === "search" || info.class === "user") { score -= 1.5; reasons.push(`${bot} (${info.class}) disallowed in robots.txt`); }
    else if (info.class === "training") { score -= 0.25; reasons.push(`${bot} (training) disallowed in robots.txt — defensible, not a search-visibility block`); }
  }
  const control = probes.control;
  if (control.blocked) {
    reasons.push(`browser-UA control fetch was itself ${control.challenge ? "challenged" : `blocked (HTTP ${control.status ?? "error"})`}; cannot isolate AI-bot-specific edge blocks from a general anti-bot wall`);
  } else {
    for (const [bot, p] of Object.entries(probes)) {
      if (bot === "control" || !p.blocked) continue;
      const w = botClass(bot) === "training" ? 0.5 : 1.5;
      score -= w;
      reasons.push(`${bot} UA ${p.challenge ? "challenged" : `blocked (HTTP ${p.status ?? "error"})`} at the edge while browser UA returned HTTP ${control.status}`);
    }
  }
  if (index.bing.indexed === false) { score -= 1; reasons.push("domain not found in Bing index (ChatGPT-search visibility gate)"); }
  if (index.brave.indexed === false) { score -= 1; reasons.push("domain not found in Brave index (Claude-search visibility gate)"); }
  return { score: Math.max(0, Math.min(5, Math.round(score))), reasons };
}

// ---- run ----
const robots = await getRobots();
const groups = robots.valid ? parseRobots(robots.text) : [];
const botRules = {};
for (const [name, cls] of BOTS) {
  const g = resolveGroup(groups, name);
  botRules[name] = { class: cls, group: g ? g.agents.join(", ") : "(none — allow-all)", allowed: allowedForPath(g, "/"), crawl_delay: g?.crawlDelay ?? null };
}

const probes = {};
for (const [name, ua] of PROBES) {
  process.stdout.write(`-> probe ${name} ... `);
  probes[name] = await probe(ua);
  console.log(probes[name].error ? `error (${probes[name].error})` : `HTTP ${probes[name].status}${probes[name].blocked ? " BLOCKED" : ""}`);
  await sleep(250); // gentle spacing so rate-limits don't masquerade as bot blocks
}

process.stdout.write("-> bing index ... ");
const bing = await bingIndex();
console.log(bing.note);
process.stdout.write("-> brave index ... ");
const brave = await braveIndex();
console.log(brave.note);

const index = { bing, brave };
const { score, reasons } = scoreAccess(robots, botRules, probes, index);

const out = {
  domain,
  checked_at: new Date().toISOString(),
  access_score: score,
  score_rationale: reasons.length ? reasons.join("; ") : "real robots.txt; no AI search/user bot disallowed; no edge blocks; present in indexes checked",
  findings: reasons,
  robots,
  bot_rules: botRules,
  ua_probes: probes,
  index_presence: index,
};
await writeFile(`${dir}/access.json`, JSON.stringify(out, null, 2) + "\n");

const blockedSearch = Object.entries(botRules).filter(([, v]) => !v.allowed && (v.class === "search" || v.class === "user")).map(([k]) => k);
const blockedEdge = Object.entries(probes).filter(([k, v]) => k !== "control" && v.blocked).map(([k]) => k);
console.log(`\naccess -> ${dir}/access.json`);
console.log(`access_score: ${score}/5`);
console.log(`robots: ${robots.valid ? "valid" : robots.present ? "present but not a real robots.txt" : "absent"}`);
if (blockedSearch.length) console.log(`robots-blocked (search/user): ${blockedSearch.join(", ")}`);
if (blockedEdge.length) console.log(`edge-blocked UAs: ${blockedEdge.join(", ")}`);
console.log(`index: bing=${bing.indexed}  brave=${brave.indexed}${process.env.BRAVE_SEARCH_API_KEY ? "" : "  (brave keyless: set BRAVE_SEARCH_API_KEY for a reliable signal)"}`);
