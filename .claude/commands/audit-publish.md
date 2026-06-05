---
description: Phase 4 of the AEO/GEO audit. Publishes a compiled prospect deck to a static host — exports the Canva deck to slide PNGs, builds the landing page from templates/landing.html, pushes to a Netlify-backed git repo, sets the report live. Args "<slug> <design_id>". Requires the compiled deck (from /audit-report) and the Canva MCP.
---

# /audit-publish

> **Deployment-specific (documented stub).** This phase is wired to one specific
> deployment: a Canva master design, a Netlify-backed git repo, and the
> `audit.lobogrowth.com` host. It is **not required to run the audit** — phases 1–3
> produce all the analysis and a self-contained `report.html`. It's kept here so the
> full pipeline is documented. Swap the host/repo specifics below for your own
> deployment, or skip it entirely and serve `companies/<slug>/report.html` however you like.

Phase 4. Turns the compiled per-prospect Canva deck into the live landing page at `<your-audit-host>/<slug>`. Runs after `/audit-report` has filled and committed the deck.

## Step 0 — Inputs + preconditions

- From `$ARGUMENTS`: `<slug>` and the compiled clone's `design_id` (printed by `/audit-report`; otherwise `search-designs` for the prospect's "AI Visibility Report" clone and confirm with the operator).
- Present: `companies/<slug>/context.json` (company name), `companies/<slug>/deck-overrides.json` (its `audit_date` becomes the page's month/year), `templates/landing.html`, `build-page.mjs`, and `site/assets/{logo.png,patrick-headshot.jpg}`.
- Canva MCP connected; you can push to the Netlify-backed deploy repo.
- STOP if the deck still holds literal `[[tokens]]` (an incomplete `/audit-report` fill). Check with `get-design-content(design_id)`; otherwise the exported PNGs ship raw tokens. Slide 6 (share of voice, cited domains) is the usual offender.

## Step 1 — Export the deck to PNGs

`get-export-formats(design_id)`, then `export-design(design_id, format {type:"png", pages:[1,2,3,4,5,6,7,8], export_quality:"pro", width:2560, height:1440})`. Export the deck slides **at 2× (2560×1440)** — the landing page shows each slide in a swipe carousel and as a PhotoSwipe pinch-zoom source, so the higher resolution is what stays sharp when a viewer zooms in (1× looks soft once enlarged on retina/mobile). Pages `[1..8]` omits the deck's closing CTA slide — the page already has its own CTA, so the CTA slide is redundant; export `[1..9]` only if you deliberately want it. The returned URLs are signed and expire in ~24h, so download immediately.

## Step 2 — Download into the page's own asset folder

Save each exported page, in order, to `site/<slug>/assets/slide-N.png` (1-based):

    curl -fsSL "<url-for-page-N>" -o site/<slug>/assets/slide-N.png

If the export returns a single archive, unzip and rename the pages `slide-1.png … slide-9.png` in order. Verify with `file site/<slug>/assets/slide-*.png` (each must report PNG).

## Step 3 — Build the landing page

`node build-page.mjs <slug>`. It stacks the downloaded `slide-*.png`, fills `{{company}}` and `{{month_year}}`, copies the shared logo + headshot into `site/<slug>/assets/`, and writes `site/<slug>/index.html`. No prose-lint here — the page copy is fixed in the template, and prose-lint is a deck-copy tool that skips HTML.

## Step 4 — Publish

Commit only this prospect's folder (the repo carries unrelated in-flight work, so stay surgical):

    git add site/<slug>
    git commit -m "Publish audit: <slug>"
    git push origin master

Netlify auto-deploys from `master`. Confirm: `curl -sI https://<your-audit-host>/<slug>/` returns `200` and `x-robots-tag: noindex`. (DNS resolves publicly; a local resolver may lag, so pin the IP if needed.)

## Step 5 — Notion

Update the **AEO Audits** row: Report URL = `https://audit.lobogrowth.com/<slug>`, Status → `Published`.

## Notes

- Re-publish by re-running from Step 1 (re-export, rebuild, push). The page always reflects the latest export.
- The page chrome (nav, the personal intro, why-us, footer) is fixed in `templates/landing.html`; only the company name, the date, and the slide images change per prospect.
