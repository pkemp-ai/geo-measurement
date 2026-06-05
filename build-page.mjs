// Landing-page builder — deterministic, no deps. Fills templates/landing.html for one
// company and writes site/<slug>/index.html, served at audit.lobogrowth.com/<slug>.
//
//   node build-page.mjs <slug>
//
// The deck shows as self-hosted slide PNGs in site/<slug>/assets/ (slide-1.png ...),
// exported from the filled Canva deck and downloaded locally (Canva export URLs expire
// ~24h, so never hot-link). If no slides are present yet, placeholder frames render so
// the page is previewable. Shared assets (headshot, logo) live in site/assets/, referenced
// as ../assets/ from the per-slug page. Generic intro + why-us copy live in the template;
// only {{company}} / {{slides}} / {{month_year}} are filled. {{month_year}} comes from
// deck-overrides.json audit_date (else the current month).

import { readFile, writeFile, mkdir, readdir, copyFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const slug = process.argv[2];
if (!slug) throw new Error("usage: node build-page.mjs <slug>");
const root = dirname(fileURLToPath(import.meta.url));

const ctx = JSON.parse(await readFile(`${root}/companies/${slug}/context.json`, "utf8"));
const tpl = await readFile(`${root}/templates/landing.html`, "utf8");
let overrides = {};
try { overrides = JSON.parse(await readFile(`${root}/companies/${slug}/deck-overrides.json`, "utf8")); } catch {}

const outDir = `${root}/site/${slug}`;
await mkdir(`${outDir}/assets`, { recursive: true });

// Copy shared assets (logo, headshot) into the per-slug dir so the page is self-contained
// and references resolve in any context (no parent-dir traversal).
for (const a of ["logo.png", "patrick-headshot.jpg"]) {
  try { await copyFile(`${root}/site/assets/${a}`, `${outDir}/assets/${a}`); } catch {}
}

// Vendor PhotoSwipe (self-hosted, no runtime CDN) into the per-slug dir so the
// click-to-zoom lightbox works offline of any third party.
await mkdir(`${outDir}/assets/photoswipe`, { recursive: true });
for (const a of ["photoswipe.esm.js", "photoswipe-lightbox.esm.js", "photoswipe.css"]) {
  try { await copyFile(`${root}/site/assets/photoswipe/${a}`, `${outDir}/assets/photoswipe/${a}`); } catch {}
}

let imgs = [];
try {
  imgs = (await readdir(`${outDir}/assets`))
    .filter((f) => /^slide-\d+\.png$/i.test(f))
    .sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));
} catch {}

// Slides are 2x 16:9 exports (2560x1440). Each is a PhotoSwipe gallery item:
// the <a> carries the full-size dimensions so pinch-zoom works correctly.
const slidesHtml = imgs.length
  ? imgs.map((f, i) => `<a class="slide" href="assets/${f}" data-pswp-width="2560" data-pswp-height="1440" target="_blank" rel="noopener" aria-label="${ctx.company} audit slide ${i + 1} of ${imgs.length}, open to enlarge"><img src="assets/${f}" alt="${ctx.company} AI visibility audit, slide ${i + 1}" loading="${i === 0 ? "eager" : "lazy"}"></a>`).join("\n        ")
  : Array.from({ length: 9 }, (_, i) => `<div class="slide-placeholder">slide ${i + 1} (export pending)</div>`).join("\n        ");

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const now = new Date();
const monthYear = overrides.audit_date || `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

const html = tpl
  .replaceAll("{{company}}", ctx.company)
  .replaceAll("{{slides}}", slidesHtml)
  .replaceAll("{{month_year}}", monthYear);

await writeFile(`${outDir}/index.html`, html);
console.log(`page  -> ${outDir}/index.html  (${imgs.length ? imgs.length + " slides" : "9 placeholders, export pending"}, ${monthYear})`);
