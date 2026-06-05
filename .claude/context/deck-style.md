# Deck Style — Lobo Growth

Visual design language for Lobo Growth pitch decks, QBRs, and proposals. Derived 100% from the live `lobogrowth.com` homepage. **If anything here contradicts the homepage, the homepage wins — update this file.**

Audit basis: `index.html` (1553 lines, audited 2026-05-28). Re-audit any time the homepage changes meaningfully.

---

## 1. Color palette

Three tiers of dark + one sage accent. **No secondary accent.**

| Token | Hex | Role |
|---|---|---|
| `--bg` | `#0F1117` | Page background. Cool/bluish-black, not warm. |
| `--bg-card` | `#16181F` | Card resting fill |
| `--bg-card-hover` | `#1A1D26` | Card interactive state |
| `--fg` | `#E8EAF0` | Primary text |
| `--fg-dim` | `#B0B3BF` | Secondary text, dek copy |
| `--muted` | `#7A7D8A` | Tertiary text, labels, footer |
| `--accent` | `#A3D9A5` | **Sage — the only chromatic color in the system** |
| `--accent-dim` | `rgba(163,217,165,0.12)` | Tinted accent fills (icon badges) |
| `--accent-border` | `rgba(163,217,165,0.22)` | Outlined accent containers |
| `--border` | `rgba(255,255,255,0.06)` | Default card border |
| `--border-hover` | `rgba(255,255,255,0.12)` | Hover border |

One-off hex values (use sparingly):
- `#B8E2B9` — sage hover on primary buttons (lightened)
- `#C4C8D0` — hero subhead color only (slightly lighter than `--fg-dim`)
- `#D3D6DD` — secondary-link resting color, disclosure summary
- `rgba(43,57,144,0.05)` — faint indigo radial in hero only. **The only non-sage chromatic value in the system.** Do not reuse elsewhere.

---

## 2. Typography

**Inter only.** Loaded with weights 200, 300, 400, 500, 600, 700. **No Roboto. No serif fonts.** Visual hierarchy comes from weight contrast + tight tracking, not from a typeface change.

### Weight + size conventions

| Element | Size (px) | Weight | Letter-spacing | Line-height |
|---|---|---|---|---|
| **Slide title** (hero h1) | clamp(36–76) | **200** | `-0.04em` | 1.0 |
| Section heading (large) | clamp(32–56) | **300** | `-0.038em` | 1.04 |
| Section h2 | clamp(28–42) | **300** | `-0.035em` | 1.06 |
| Subsection h3 (floats) | clamp(28–44) | **300** | `-0.038em` | 1.05 |
| Engagement card name | clamp(26–32) | **300** | `-0.035em` | 1.08 |
| Founder name | clamp(26–36) | **300** | `-0.038em` | 1.08 |
| Card h3 (services, notes) | 20 | **500** | `-0.022em` | 1.25 |
| Channel/sub-card h4 | 15 | 500 | `-0.015em` | 1.25 |
| Hero subhead | clamp(16–19) | 400 | `-0.005em` | 1.55 |
| Body / card `<p>` | 15 | 400 | — | 1.7 |
| Founder bio | 14.5 | 400 | — | 1.7 |
| **Eyebrow** | 11 | 500 | **`2.5px`** | uppercase |
| Engagement num "01" | 12 | 500 | **`0.2em`** | uppercase |
| Engagement meta | 12.5 | 500 | **`0.08em`** | uppercase |
| Deliverables label | 11 | 600 | **`0.18em`** | uppercase |
| Btn-primary | 15 | 500 | `-0.005em` | — |
| Btn-secondary (text link) | 15 | 400 | `-0.005em` | — |
| Nav link | 14 | 400 | — | — |

### The `<em>` pattern (mandatory)

Every section heading on the site uses an `<em>` phrase. The `<em>` is restyled:

```css
em {
  font-style: normal;       /* italic stripped */
  font-weight: inherit;     /* same as parent (200 or 300) */
  color: var(--accent);     /* sage */
}
```

**Every deck section title and most slide titles should follow this pattern.** Examples from the site:

- `Your startup needs a marketing engine, <em>not another AI advisor.</em>`
- `We operationalize AI to <em>grow your company.</em>`
- `Operating notes from working with <em>clients like you.</em>`
- `Let's build your <em>marketing engine.</em>`

Pattern: long phrase in `--fg` + sage punchline phrase. Lighter weight on the entire heading; sage carries the emphasis through color, not bold.

---

## 3. Spacing + layout

- Section vertical padding: `clamp(64px, 9vh, 104px)`
- Tight section: `clamp(48px, 7vh, 80px)`
- Hero padding: `clamp(120px, 18vh, 200px) 0 clamp(36px, 5vh, 56px)`; min-height 70vh
- Container max width: **1200px** default, 920px narrow; horizontal padding `clamp(20px, 5vw, 48px)`
- Card padding: `clamp(24px, 3vw, 32px)` standard, `clamp(28px, 3vw, 40px)` for engagement cards
- Grid gap (cards): **20px**
- Founder grid gap: `clamp(40px, 5vw, 64px)`
- Section-head bottom margin: `clamp(32px, 5vh, 48px)`

For 16:9 slides at 1920×1080, scale these down ~25–35% as needed but keep proportions.

---

## 4. Borders + radii

- **Cards: 12px** (`--radius`)
- **Buttons: 3px hardcoded** — the visual signature of "interactive." Soft cards, crisp buttons. Do not substitute `--radius`.
- Form inputs: 8px (`--radius-sm`)
- Icon badge: 10px (or 8px when 36px size)
- Icon link circle: 50% (40px diameter)

Border treatment:
- Default: `1px solid rgba(255,255,255,0.06)`
- Engagement / "major offering" cards: add `border-left: 3px solid var(--accent)`
- Hover state: full perimeter becomes `--accent-border`; left border stays solid sage

---

## 5. Backgrounds + atmosphere

### Grain overlay (essential, every slide)

```css
body::before {
  content:'';position:fixed;inset:0;z-index:9999;
  pointer-events:none; opacity:0.025;
  background-image:url("data:image/svg+xml,...feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'...");
  background-size:150px;
}
```

The site never reads as "flat dark" because of this film. **Slides without grain will look too clean.** In Canva, export the noise to a PNG and layer at 2.5% opacity over each slide background.

### Hero radial gradients (title slides only)

```css
background:
  radial-gradient(ellipse 800px 500px at 25% 50%, rgba(163,217,165,0.06), transparent 70%),
  radial-gradient(ellipse 700px 500px at 80% 30%, rgba(43,57,144,0.05), transparent 70%);
```

Sage glow lower-left + a faint indigo glow upper-right. Use only on the deck's title and closing slides — too much glow distracts on interior slides.

### Grid overlay (optional, for hero/title moments)

64×64 grid, 1px lines at 1.5% white, masked to fade from left-center. Adds a subtle blueprint feel.

---

## 6. Component patterns

### Engagement card (the canonical "major offering" pattern)

```
[01] Sprints                    ← num + name
4 WEEKS · ONE KPI               ← meta (uppercase)
We build an agentic marketing workflow...
                                ← desc
WHAT YOU GET                    ← deliverables label (uppercase)
— Performance audit             ← deliverables (10px sage dash before each)
— Custom AI agents
— Workflow run book

[Book intro]                    ← CTA pinned to bottom
```

Card has 3px sage left border. CTA is inverted: bg `--bg`, color `--accent`, border `1px solid --accent`. Hover fills with `--accent-dim`.

This pattern is the deck's primary "two-up comparison" — use for Engagement Models, before/after, etc.

### Founder card

Photo (max-width 200px, 12px radius, grayscale on site) + name + role + 2 paragraph bios + actions row (button + LinkedIn icon-link). Two `<p>` paragraphs is the convention. Em-dashes for company callouts ("— earning 7 patents," "— reaching 34M+ loyal passengers").

**For deck: keep founder photos in color** (the site grayscales them to subordinate them visually; on a slide they're the focal point, so color reads warmer).

### Logo marquee / "Our experience"

Grayscale at 40% opacity, brightened 1.6×, 28px tall (40px for icon-only marks). Eyebrow label above: `Our experience`. Mask gradient fades both edges.

For a static deck slide, render as a single row of muted logos with the eyebrow above.

### Float-row (services illustrations)

Two-column: text + SVG halftone-dot illustration. Reverse alternates direction. The SVG style is its own brand pattern:

- Halftone-dot disc background (sage at 32% on a radial fade mask)
- Rounded-rect nodes containing small line-art icons + Inter-labels (12px / weight 500, sage)
- Sage stroke connecting lines, 1.5px stroke width
- Blurred sage halo behind the whole illustration (`filter: blur(40px)`)

**This is the canonical visualization style for agent / workflow concepts.** Use it on "What We Build," "How We Work," and "Agentic Workflow Examples" slides — not stock icons.

---

## 7. Buttons

| Variant | Spec |
|---|---|
| **Primary** | Sage bg `#A3D9A5`, dark text `--bg`, padding `14px 24px`, radius **3px**, weight 500 |
| **Nav CTA** | Same color scheme, smaller padding `8px 18px`, 1px sage border |
| **Engagement card primary** (inverted) | bg `--bg`, color `--accent`, 1px sage border, same 3px radius. Hover fills with `--accent-dim`. |
| **Secondary** | Text-only link, color `#D3D6DD` → `--fg` on hover. Underline at 40% opacity thickens to 100%. Arrow `↓` translates Y+3px on hover. No background. |
| **Notes pill** | Transparent bg, 1px `--accent-border`, color `--accent`, padding `9px 18px`, radius 3px. Gap label↔arrow grows 8→12px on hover. |

CTA case is **not normalized** across the site — Hero uses `Book Intro` (title case), engagement cards use `Book intro` (sentence case). The deck can pick either convention but apply consistently per slide.

---

## 8. Animation / interaction (mostly N/A for static decks, kept for reference)

- Hero copy: staggered `fadeUp 0.7–0.8s`, delays 0.05 → 0.45s
- Marquee: 36s linear infinite
- Card hover: `0.25s` morph (border + bg only — **never shadow on cards**)
- Buttons get shadow lifts on hover; cards don't.

---

## 9. Anchor phrases (use verbatim in decks)

These are the brand's signature lines from the live homepage:

- **Hero h1:** "Your startup needs a marketing engine, **not another AI advisor.**"
- **Hero subhead:** "We build agentic marketing workflows for B2B startups that move KPIs. Engage us on a focused sprint or as fractional growth marketers. **You own what we build and never commit long term.**"
- **Engagement dek:** "We're not an agency that leaves behind strategy docs and activity history. We build you marketing agents and put them to work."
- **Service description (JSON-LD):** "Agentic marketing workflows for B2B startups that move KPIs — paid, outbound, content, and website. Engage us on a focused sprint or as fractional growth marketers. **You own what we build.**"
- **Sprints:** "4 weeks · One KPI"
- **Fractional:** "Monthly fee · No commitment"

### Voice mechanics

- **Em-dash beats** for company/result callouts: "— earning 7 patents," "— reaching 34M+ loyal passengers." Always real em-dash (`—`), not hyphen.
- **Ownership claim** in repeated forms: "You own what we build," "you own the agents." This is a non-negotiable closing phrase.
- **Additive, not combative.** Lobo is the layer on top of vendor tools, not "they're wrong."
- **Sage punchline in headings.** Every section heading ends with a sage `<em>` phrase. No exceptions.

---

## 10. Service / capability framing (from JSON-LD OfferCatalog)

Five canonical service offers. **Use these 5 names verbatim on the "Agentic Workflow Examples" slide** rather than the older Notion list:

1. **Marketing agent development** — "Custom AI marketing agents purpose-built for your startup, connected to your data, marketing channels, and analytics tools."
2. **Paid acquisition** — "Search, social, and programmatic advertising — bought and optimized."
3. **Content and email marketing** — "Growth content, landing pages, and email campaigns that convert."
4. **Outbound marketing** — "ICP-targeted email and LinkedIn sequences, coordinated with sales."
5. **Website optimization** — "SEO, AEO, and CRO that turn your site into an acquisition engine."

Audience: `VC-funded B2B startups`. Tools called out by name: `HubSpot`, `Claude`, `n8n`.

---

## 11. Watch-outs (homepage-specific)

1. **Button radius is 3px, hardcoded.** Don't reach for `--radius`.
2. **Hero h1 is weight 200** — most decks default to bold. This will look heavy compared to the site.
3. **Background is `#0F1117` (bluish-black), not pure black.** Warm darks and true blacks read as off-brand.
4. **Grain at 0.025 opacity is essential.** Without it, slides look too clean for the site.
5. **Card hover is borders + bg, never shadow.** Shadows are for buttons only.
6. **Founder photos are grayscaled on the site** — but in the deck, keep them color (they're focal points).
7. **CTA case varies** (Book Intro vs Book intro) — pick per slide, don't normalize globally.
8. **"Fieldwork" is the blog's nav label** (it replaced the earlier "Field Notes") — use Fieldwork in any deck that references the blog.
9. **Calendar is the primary contact mechanism**, form is a disclosure — reflect this on Investment & Next Steps if it has a contact element.
10. **`em` pattern is mandatory** — every section heading needs a sage emphasis phrase. Don't skip it.
