// Site checks — deterministic onsite facts for the v2.2 scoring framework.
// Captures the FROZEN PAGE SAMPLE (canonical Notion page, section 3) and emits
// scripted facts for: fetchability_no_js, crawl_coverage, entity_schema,
// content_freshness, branded_faq (presence half), pricing (presence half),
// answer_structure (structure facts), llms_txt (footnote). The onsite evidence
// agent reads this file first and layers the judgment-needing inventories on top.
//
// Sample = homepage + about/company + pricing (if any) + up to 4 nav-prominent
// pages + blog index + last 12 posts. Sampled URLs are recorded; re-runs reuse
// the recorded sample if present (freeze semantics).
//
//   node site-checks.mjs <slug> [domain-override]

import { readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const slug = process.argv[2];
if (!slug) throw new Error("usage: node site-checks.mjs <slug> [domain]");
const root = dirname(fileURLToPath(import.meta.url));
const dir = `${root}/companies/${slug}`;

const ctx = JSON.parse(await readFile(`${dir}/context.json`, "utf8"));
const domain = (process.argv[3] || ctx.domain || "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
if (!domain) throw new Error("no domain");
const origin = `https://${domain}`;

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const TIMEOUT = 20000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,*/*" }, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT) });
    const html = await r.text();
    return { status: r.status, ok: r.ok, html, final_url: r.url, bytes: html.length };
  } catch (e) {
    return { status: null, ok: false, html: "", final_url: url, bytes: 0, error: e.message };
  }
}

// ---- HTML extraction helpers (no deps) ----
const stripTags = (html) => html
  .replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ").replace(/<svg[\s\S]*?<\/svg>/gi, " ")
  .replace(/<[^>]+>/g, " ").replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " }[m]))
  .replace(/\s+/g, " ").trim();

const headings = (html) => [...html.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi)]
  .map((m) => `h${m[1]}: ${stripTags(m[2]).slice(0, 120)}`).slice(0, 20);

const ldTypes = (html) => {
  const types = new Set(); let sameAs = 0;
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const collect = (o) => {
        if (!o || typeof o !== "object") return;
        if (Array.isArray(o)) return o.forEach(collect);
        if (o["@type"]) [].concat(o["@type"]).forEach((t) => types.add(t));
        if (o.sameAs) sameAs += [].concat(o.sameAs).length;
        Object.values(o).forEach(collect);
      };
      collect(JSON.parse(m[1]));
    } catch {}
  }
  return { types: [...types], sameAs_count: sameAs };
};

const meta = (html, name) => html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']*)["']`, "i"))?.[1]
  ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${name}["']`, "i"))?.[1] ?? null;

const pageDates = (html) => {
  const out = new Set();
  for (const m of html.matchAll(/datetime=["'](\d{4}-\d{2}-\d{2})/g)) out.add(m[1]);
  for (const m of html.matchAll(/"date(?:Published|Modified)"\s*:\s*"(\d{4}-\d{2}-\d{2})/g)) out.add(m[1]);
  for (const m of html.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) out.add(m[0]);
  return [...out].filter((d) => d >= "2015-01-01" && d <= "2027-12-31").sort().slice(-5);
};

const faqSignals = (html) => ({
  faqpage_schema: /FAQPage/i.test(html),
  question_itemtype: /itemtype=["'][^"']*Question/i.test(html),
  faq_class: /class=["'][^"']*faq/i.test(html),
  details_blocks: (html.match(/<details[\s>]/gi) || []).length,
});

const internalLinks = (html) => {
  const links = new Map();
  for (const m of html.matchAll(/<a[^>]+href=["']([^"'#?]+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let href = m[1].trim();
    if (/^(mailto:|tel:|javascript:)/i.test(href)) continue;
    if (href.startsWith("//")) href = "https:" + href;
    try {
      const u = href.startsWith("http") ? new URL(href) : new URL(href, origin + "/");
      if (u.hostname.replace(/^www\./, "") !== domain) continue;
      const path = u.pathname.replace(/\/$/, "") || "/";
      if (!links.has(path)) links.set(path, stripTags(m[2]).slice(0, 60));
    } catch {}
  }
  return links;
};

function analyzePage(url, res) {
  const html = res.html;
  const text = stripTags(html);
  const ld = ldTypes(html);
  return {
    url, status: res.status, bytes: res.bytes, final_url: res.final_url,
    text_chars: text.length,
    text_ratio: res.bytes ? Math.round((text.length / res.bytes) * 1000) / 1000 : 0,
    spa_shell: res.bytes > 0 && text.length < 600 && /<div[^>]+id=["'](root|app|__next)/i.test(html),
    title: html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim().slice(0, 150) ?? null,
    canonical: /<link[^>]+rel=["']canonical/i.test(html),
    og_type: meta(html, "og:type"),
    ld_types: ld.types, sameAs_count: ld.sameAs_count,
    headings: headings(html),
    intro_excerpt: text.slice(0, 600),
    brand_in_raw: new RegExp(`\\b${ctx.company}\\b`, "i").test(text),
    dates: pageDates(html),
    faq: faqSignals(html),
  };
}

// ---- discover the sample ----
console.log(`site-checks: ${domain}`);
const home = await get(origin + "/");
if (!home.ok) console.warn(`! homepage ${home.status ?? home.error}`);
const nav = internalLinks(home.html);

const pick = (re) => [...nav.keys()].find((p) => re.test(p));
const aboutPath = pick(/^\/(about|company|who-we-are|about-us|team)$/i) ?? pick(/about|company/i);
const pricingPath = pick(/^\/pricing/i) ?? pick(/pricing/i);
const blogPath = pick(/^\/(blog|insights|resources|news|newsroom)$/i) ?? pick(/blog|insights|newsroom/i);
const skip = new Set(["/", aboutPath, pricingPath, blogPath, "/privacy", "/terms", "/careers", "/legal", "/cookies", "/contact"]);
const navPages = [...nav.keys()].filter((p) => !skip.has(p) && !/privacy|terms|careers|legal|cookie|contact|login|signin|search/i.test(p)).slice(0, 4);

// Reuse a previously frozen sample when present.
let prior = null;
try { prior = JSON.parse(await readFile(`${dir}/site-facts.json`, "utf8")); } catch {}
let sampleUrls;
if (prior?.sample?.urls?.length) {
  sampleUrls = prior.sample.urls.filter((u) => !u.is_post).map((u) => u.url);
  console.log(`reusing frozen sample (${sampleUrls.length} pages) from ${prior.captured_at}`);
} else {
  sampleUrls = [...new Set(["/", aboutPath, pricingPath, ...navPages, blogPath].filter(Boolean).map((p) => origin + (p === "/" ? "/" : p)))];
}

const pages = [];
for (const url of sampleUrls) {
  process.stdout.write(`-> ${url} ... `);
  const res = await get(url);
  pages.push(analyzePage(url, res));
  console.log(`${res.status} (${res.bytes}b, text ${pages.at(-1).text_chars})`);
  await sleep(200);
}

// blog: pull last 12 post links from the blog index
let posts = [];
const blogIndex = pages.find((p) => blogPath && p.url === origin + blogPath);
if (blogIndex) {
  const blogRes = await get(blogIndex.url);
  const links = [...internalLinks(blogRes.html).keys()]
    .filter((p) => blogPath && p.startsWith(blogPath + "/") && p.length > blogPath.length + 1)
    .slice(0, 12);
  for (const p of links) {
    const res = await get(origin + p);
    const a = analyzePage(origin + p, res);
    posts.push({ url: a.url, status: a.status, title: a.title, dates: a.dates, intro_excerpt: a.intro_excerpt.slice(0, 300), headings: a.headings.slice(0, 6) });
    await sleep(150);
  }
}

// sitemap + llms.txt
const sm = await get(origin + "/sitemap.xml");
const smIndex = !sm.ok ? await get(origin + "/sitemap_index.xml") : null;
const sitemapReal = (r) => r?.ok && /<(urlset|sitemapindex)/i.test(r.html);
const llms = await get(origin + "/llms.txt");
const llmsReal = llms.ok && !/<(!doctype|html)/i.test(llms.html.slice(0, 200));

// ---- assemble facts per element ----
const aboutPage = pages.find((p) => aboutPath && p.url.endsWith(aboutPath));
const pricingPage = pages.find((p) => pricingPath && p.url.endsWith(pricingPath));
const allDates = [...pages.flatMap((p) => p.dates), ...posts.flatMap((p) => p.dates)].sort();

const facts = {
  slug, domain, captured_at: prior?.captured_at ?? new Date().toISOString(), updated_at: new Date().toISOString(),
  sample: {
    urls: [
      ...pages.map((p) => ({ url: p.url, status: p.status })),
      ...posts.map((p) => ({ url: p.url, status: p.status, is_post: true })),
    ],
    about_found: Boolean(aboutPage), pricing_found: Boolean(pricingPage), blog_found: Boolean(blogIndex),
  },
  elements: {
    fetchability_no_js: {
      facts: pages.map((p) => ({ url: p.url, text_chars: p.text_chars, text_ratio: p.text_ratio, spa_shell: p.spa_shell, brand_in_raw: p.brand_in_raw, status: p.status })),
      note: "raw-HTML heuristics (visible-text volume, SPA-shell markers, brand presence in raw text); AI crawlers execute no JS",
    },
    crawl_coverage: {
      facts: {
        sitemap_real: sitemapReal(sm) || sitemapReal(smIndex),
        sitemap_status: sm.status,
        canonical_on_sample: pages.filter((p) => p.canonical).length + "/" + pages.length,
        homepage_og_type: pages[0]?.og_type ?? null,
        nav_paths_found: [...nav.keys()].slice(0, 25),
        about_page: aboutPage?.url ?? null, pricing_page: pricingPage?.url ?? null, blog_index: blogIndex?.url ?? null,
      },
    },
    entity_schema: {
      facts: pages.map((p) => ({ url: p.url, ld_types: p.ld_types, sameAs_count: p.sameAs_count })),
    },
    content_freshness: {
      facts: {
        pages_with_dates: pages.filter((p) => p.dates.length).length + "/" + pages.length,
        latest_date_on_sample: allDates.at(-1) ?? null,
        latest_post_date: posts.flatMap((p) => p.dates).sort().at(-1) ?? null,
        post_dates: posts.map((p) => ({ url: p.url, dates: p.dates })),
      },
    },
    branded_faq: {
      facts: pages.map((p) => ({ url: p.url, ...p.faq })),
    },
    answer_structure: {
      facts: pages.map((p) => ({ url: p.url, title: p.title, headings: p.headings, intro_excerpt: p.intro_excerpt })),
    },
    pricing_transparency: {
      facts: { pricing_page: pricingPage ? { url: pricingPage.url, intro_excerpt: pricingPage.intro_excerpt, headings: pricingPage.headings } : null },
    },
    llms_txt: { facts: { present: llmsReal, status: llms.status }, footnote: true },
    blog_engine: {
      facts: { blog_index: blogIndex?.url ?? null, last_posts: posts.map((p) => ({ url: p.url, title: p.title, date: p.dates.at(-1) ?? null, intro_excerpt: p.intro_excerpt })) },
      note: "composition classification of these 12 posts is the onsite agent's job",
    },
  },
};

await writeFile(`${dir}/site-facts.json`, JSON.stringify(facts, null, 2) + "\n");
console.log(`\nsite-facts -> ${dir}/site-facts.json`);
console.log(`sample: ${pages.length} pages + ${posts.length} posts | sitemap_real=${facts.elements.crawl_coverage.facts.sitemap_real} | llms.txt=${llmsReal}`);
console.log(`schema types on sample: ${[...new Set(pages.flatMap((p) => p.ld_types))].join(", ") || "none"}`);
