// Scoring framework v2.2 — runtime rubric. Mirrors the canonical framework page.
// When they disagree, the canonical page wins; update this file and bump
// RUBRIC_VERSION.
//
// check: "mech" = scored by code in score-elements.mjs from frozen facts.
//        "judged" = pinned judge at temp 0 over frozen facts, against `anchors`.
//        "composite" = decomposed multi-facet score (mech facets + a facet judge,
//          combined in code); see lib/content-engine.mjs (content_engine).
// job:   disc | assess | both | gate (gate counts toward both rollups).
// conditional: profiles that activate the element (null = always on).
// N/A rule: inapplicable elements are excluded from rollups, never zeroed.

export const FRAMEWORK_VERSION = "2.4";
export const RUBRIC_VERSION = "2.6";

// ---- Importance scoring (theory-vs-practice, v2.3) ----
// importance = w_global x tier prior + w_local x observed citation signal,
// scaled to 1-5. priority = importance x (5 - audit score). Weights are the
// calibration knob (operator decision 2026-06-12: 25/75 — practice leads.
// The 50/50 blend let zero-cited source classes keep top-3 priority on the
// prior alone, e.g. a dev-tool's G2/Capterra at 0 of 27 answers ranking P8.8).
export const IMPORTANCE = {
  w_global: 0.25,
  w_local: 0.75,
  // Evidence-tier priors (the external research base, fixed across clients).
  tier_prior: {
    "T1": 1.0, "T1/T2": 0.8,
    "T2": 0.6, "T2 + own data": 0.6, "T2 (inference)": 0.6,
    "T2/T3": 0.45, "T2-T3": 0.45,
    "T3": 0.3,
  },
  tier_prior_default: 0.6,
};

// ---- Citation-observability classification (v2.5) ----
// Whether the observed cited-source mix in the measured prompts is a meaningful
// signal of an element's importance. Some elements deliver value through a channel
// the prompts cannot observe as a citation, so weighting their importance on
// citation share is wrong: it self-suppresses (a brand with no Wikipedia page is
// never cited from Wikipedia; a blocked crawler removes the brand from the
// citations entirely, burying the most urgent fix). Three modes:
//   "citation" (default) — value shows up as cited sources; importance = the 25/75
//      theory-x-practice blend over the observed share (LOCAL_SIGNAL classes).
//   "prior" — value is grounding (entity resolution, schema, encyclopedic slot),
//      offsite awareness (podcasts, exec social, forums), or a pass/fail gate
//      (crawler access, indexation). Not observable as a citation. importance =
//      theory prior only (1 + 4 x tier_prior); the gap drives priority. The local
//      citation evidence is still computed for transparency but never weighted, so
//      the tier IS the importance for these elements.
//   "harm" — measured by the audit's own wrong-entity rate, not citations
//      (name_binding). Uses the blend over that harm-derived signal.
export const SIGNAL_MODE = {
  // gates: pass/fail; a failing gate suppresses its own citation signal.
  ai_crawler_access: "prior", search_index_presence: "prior",
  fetchability_no_js: "prior", crawl_coverage: "prior",
  // grounding: entity resolution / machine-readable facts / encyclopedic slot.
  entity_schema: "prior", wikipedia_wikidata: "prior", directory_consistency: "prior",
  // offsite awareness: authority that rarely surfaces as a cited URL.
  podcasts: "prior", executive_social: "prior", community_forums: "prior",
  // harm-measured.
  name_binding: "harm",
  // everything else defaults to "citation".
};
export const signalMode = (id) => SIGNAL_MODE[id] ?? "citation";

// Local-signal map: which observed citation classes evidence each element's
// importance. "role:X" = page-role of vendor-owned citations (own_domain +
// competitor pages, classified by URL path heuristics — internal computation
// only, never client-facing). "vendor_all" = all vendor-owned citations (gates
// and page-wide properties inherit it). "harm:wrong_entity" = the audit's own
// wrong-entity rate (name_binding). These classes are still computed for the
// importance/transparency evidence, but SIGNAL_MODE decides whether the observed
// share is weighted into importance ("citation"/"harm") or ignored for the prior
// ("prior" elements — empty entries below are all prior-mode).
export const LOCAL_SIGNAL = {
  category_pub_mentions: ["listicle", "explainer"],
  press_earned_media: ["news_press"],
  reddit: ["reddit"],
  youtube: ["video"],
  wikipedia_wikidata: ["wikipedia"],
  directory_consistency: ["directory"],
  review_sites: ["review_site", "validation_domains"],
  podcasts: [], executive_social: [], community_forums: [],
  category_guides: ["role:guides"],
  comparison_pages: ["role:comparison", "role:product"],
  offering_home: ["role:product", "role:home"],
  company_home: ["role:company", "role:home"],
  branded_faq: ["role:faq", "role:company"],
  content_engine: ["role:blog_news"],
  developer_docs: ["role:docs"],
  case_studies: ["role:case_studies"],
  original_research_data: ["role:research_trust"],
  pricing_transparency: ["role:pricing"],
  answer_structure: ["vendor_all"],
  ai_crawler_access: ["vendor_all"],
  search_index_presence: ["vendor_all"],
  fetchability_no_js: ["vendor_all"],
  crawl_coverage: ["vendor_all"],
  entity_schema: ["vendor_all"],
  name_binding: ["harm:wrong_entity"],
};

// Domains for the profile-resolved validation sources, so review_sites'
// local signal matches actually-cited hosts (a Messari citation counts for a
// crypto profile even though it isn't tagged review_site).
export const VALIDATION_DOMAINS = {
  "G2": ["g2.com"], "Capterra": ["capterra.com"], "TrustRadius": ["trustradius.com"],
  "Gartner": ["gartner.com"], "Forrester": ["forrester.com"], "Gartner Peer Insights": ["gartner.com"],
  "GitHub": ["github.com"], "Product Hunt": ["producthunt.com"], "Hacker News": ["news.ycombinator.com"],
  "Messari": ["messari.io"], "CoinGecko": ["coingecko.com"], "CoinMarketCap": ["coinmarketcap.com"], "CertiK": ["certik.com"],
  "Trustpilot": ["trustpilot.com"], "app stores": ["apps.apple.com", "play.google.com"],
  "Clutch": ["clutch.co"],
};

export const PROFILES = ["plg_saas", "enterprise_b2b", "dev_tool", "crypto_infra", "consumer", "services"];

// review_sites source sets per profile (union across primary+secondary).
// dev_tool deliberately excludes classic review sites (G2/Capterra were cited in
// 0 of 27 answers on a real dev-tool audit; StackShare is stale) — dev tools are
// vetted on community surfaces models actually cite. Hybrids that also sell via
// PLG/enterprise pick up G2/Gartner-class sources from their secondary profile.
export const VALIDATION_SOURCES = {
  plg_saas: ["G2", "Capterra", "TrustRadius"],
  enterprise_b2b: ["Gartner", "Forrester", "Gartner Peer Insights"],
  dev_tool: ["GitHub", "Product Hunt", "Hacker News"],
  crypto_infra: ["Messari", "CoinGecko", "CoinMarketCap", "CertiK"],
  consumer: ["Trustpilot", "app stores"],
  services: ["Clutch", "G2"],
};

export const ELEMENTS = [
  // ---- Access (eng; retrieval; fully scripted) ----
  { id: "ai_crawler_access", lever: "access", job: "gate", tier: "T1", check: "mech" },
  { id: "search_index_presence", lever: "access", job: "gate", tier: "T1/T2", check: "mech" },
  { id: "fetchability_no_js", lever: "access", job: "gate", tier: "T1", check: "mech" },
  { id: "crawl_coverage", lever: "access", job: "assess", tier: "T2", check: "mech" },

  // ---- Identity (brand/site; assessment engine) ----
  {
    id: "company_home", lever: "identity", job: "assess", tier: "T2", check: "judged",
    anchors: `0 = no about page, company facts absent from the domain. 3 = facts exist but scattered or blog-buried. 5 = canonical about/company page with full fact set (named leadership, founding/HQ/funding) and explicit parent/network/sister-entity relationship sentences in declarative claim form. Interpolate 1,2,4.`,
  },
  {
    id: "offering_home", lever: "identity", job: "assess", tier: "T2", check: "judged",
    anchors: `0 = product/service facts live only off-domain (satellite domains). 3 = pages exist but thin, or half the catalog is satellite-only. 5 = every core offering has an own-domain claim-form page; satellites link back. Interpolate 1,2,4.`,
  },
  {
    id: "branded_faq", lever: "identity", job: "assess", tier: "T2", check: "judged",
    anchors: `0 = no FAQ content or markup anywhere. 3 = some Q&A exists but gaps on the by-name questions the audit actually asked (provided as assessment prompts). 5 = FAQ covers the audit's by-name question set, with FAQPage schema. Interpolate 1,2,4.`,
  },
  { id: "entity_schema", lever: "identity", job: "assess", tier: "T1/T2", check: "mech" },
  {
    id: "name_binding", lever: "identity", job: "assess", tier: "T2", check: "judged",
    anchors: `0 = models default to a namesake on by-name prompts (wrong_entity flags in the audit's own run). 3 = collisions exist; models bind correctly with the natural disambiguator. 5 = unambiguous binding, zero wrong-entity answers, no significant namesake pressure. Interpolate 1,2,4. Weight the audit's own wrong_entity rate as primary evidence.`,
  },
  {
    id: "directory_consistency", lever: "identity", job: "assess", tier: "T2", check: "judged",
    anchors: `0 = missing or wrong-entity profiles. 3 = present but stale, inconsistent, or filed under another name. 5 = all present (LinkedIn company, Crunchbase, PitchBook + profile extras), same descriptor, right category, current. Interpolate 1,2,4.`,
  },
  {
    id: "wikipedia_wikidata", lever: "identity", job: "both", tier: "T2", check: "judged",
    anchors: `0 = nothing; the encyclopedic slot is empty. 3 = stand-ins only (profile-resolved, e.g. IQ.wiki/Messari for crypto), or a stub/outdated article. 5 = accurate maintained Wikipedia article whose lede binds the entity correctly, plus Wikidata. Interpolate 1,2,4.`,
  },

  // ---- Content (content team; retrieval) ----
  {
    id: "original_research_data", lever: "content", job: "disc", tier: "T1", check: "judged",
    anchors: `FULL LADDER (existence x reachability/quotability): 0 = no proprietary research or data. 1 = data exists but is unreachable as a citable asset (dead-linked, PR-locked, bare-PDF only). 2 = data exists and is reachable but mis-hosted or mis-attributed (credited to a foundation or third party, not the company). 3 = a reachable, on-domain, attributed data asset, but one-off or thinly quotable. 4 = a strong on-domain data asset with quotable headline numbers. 5 = a recurring branded data asset that third parties already cite.`,
  },
  {
    id: "category_guides", lever: "content", job: "both", tier: "T2", check: "judged",
    anchors: `0 = no on-domain guide for any category term. 3 = guides exist on some terms, blog-grade depth. 5 = the reference guide for the category, or a named concept/definition the category itself reuses. Interpolate 1,2,4.`,
  },
  {
    id: "comparison_pages", lever: "content", job: "both", tier: "T2", check: "judged",
    anchors: `0 = none. 3 = some pages but stale, or aimed at assumed rather than actual rivals. 5 = current honest comparison/alternatives pages against the rivals actually winning the category answers (from the consideration set). A single multi-rival page or per-rival pages both count as coverage. Interpolate 1,2,4.`,
  },
  {
    id: "case_studies", lever: "content", job: "both", tier: "T2", check: "judged",
    anchors: `0 = none. 3 = logo walls or anonymized stories without numbers (for enterprise profiles, anonymized-but-concrete sits here, not lower). 5 = named + numeric + current case studies tied to the category terms. Interpolate 1,2,4.`,
  },
  {
    id: "content_engine", lever: "content", job: "both", tier: "T2", check: "composite",
    anchors: `Composite publishing-quality score (computed in lib/content-engine.mjs from site-checks per-post facts plus a facet judge), six facets 0-5 combined by a normalized weighted mean with a nascent-cadence gate. Facets and weights: frequency 0.10 (substantive-post cadence + maturity; under ~6 months active or under ~6 substantive posts caps the whole element at 2), original_perspective 0.30, icp_fit 0.30, bylines 0.15, structure 0.15 (communicative titles + clean top summary + heading hierarchy), show_dont_tell 0.10 (specifics/sources vs marketing assertions). frequency + bylines are computed in code; the judge classifies each post press|substantive and scores the four soft facets. Replaces the old blog_engine + content_freshness elements.`,
  },
  {
    id: "answer_structure", lever: "content", job: "both", tier: "T2", check: "judged",
    anchors: `0 = marketing-fluff openings everywhere; answers buried. 3 = mixed. 5 = consistently answer-first across the frozen page sample (answer in first 30%, Q&A/heading hierarchy, liftable claim sentences). Interpolate 1,2,4.`,
  },
  {
    id: "pricing_transparency", lever: "content", job: "both", tier: "T2", check: "judged",
    anchors: `Profile-modulated. plg_saas: 0 = nothing; 3 = page exists, numbers gated/unparseable; 5 = public tiers a model can quote. enterprise_b2b: 0 = total opacity; 3 = contact-sales with no model context; 5 = pricing model explained in claim form (how you charge, even without numbers). OSS/open protocol: N/A. Interpolate 1,2,4.`,
  },
  {
    id: "developer_docs", lever: "content", job: "both", tier: "T2", check: "judged", conditional: ["dev_tool", "crypto_infra"],
    anchors: `0 = no public docs. 3 = docs exist but crawler-blocked, or high-star READMEs that open with build tables instead of definitions. 5 = fetchable docs whose landing pages open with quotable plain-prose definitions. Interpolate 1,2,4.`,
  },

  // ---- Reputation (PR/community; both clocks; discoverability engine) ----
  {
    id: "press_earned_media", lever: "reputation", job: "disc", tier: "T1", check: "judged",
    anchors: `FULL LADDER (volume x framing): 0 = nothing beyond own channels and wires. 1 = only press-release syndication, no original reporting. 2 = occasional original coverage in second-tier outlets, or bylines only. 3 = some original tier-1 coverage, but sporadic or the brand's frame / entity binding is muddled. 4 = recurring original tier-1 coverage carrying the brand's frame. 5 = repeated marquee features in the category's top outlets AND the always-included core (CNN/NYT/WSJ), brand framed and entity-bound correctly.`,
  },
  {
    id: "category_pub_mentions", lever: "reputation", job: "disc", tier: "T1", check: "judged",
    anchors: `Brand presence across third-party category PUBLICATIONS that name vendors: ranked roundups ("best X", alternatives), buyer guides, vendor comparisons, and neutral explainers about the category. 0 = absent from every checked publication. 1 = named only in passing in one low-traffic page. 2 = present in a few, below-the-fold or non-recommending framing. 3 = present across some, mid-position, or missing the highest-traffic ones. 4 = recurring inclusion with correct framing across the category's publications. 5 = top-positioned across the major roundups and guides with the right framing. Publications cited by the measured AI responses are ground truth and weigh heaviest. Interpolate 1,2,4.`,
  },
  {
    id: "reddit", lever: "reputation", job: "disc", tier: "T1", check: "judged",
    anchors: `FULL LADDER (tone is a DEPRESSOR, not a tiebreak; a citable negative narrative is worse than absence): 0 = a negative organic narrative is the dominant Reddit signal, no positive counterweight. 1 = effectively no organic third-party endorsement (only brand-affiliated subreddits), OR a live negative narrative alongside thin self-referential presence. 2 = thin organic presence, mostly self-referential, neutral-to-mixed, no significant negative narrative. 3 = some genuine organic discussion in relevant subreddits, net-neutral, not dominated by the project's own hubs. 4 = solid organic presence across relevant and some high-trust general subs, net-positive, brand named correctly. 5 = frequent organic positive discussion in high-trust general subs, recommended by unaffiliated users. A dominant negative narrative also raises a risk-register entry.`,
  },
  {
    id: "podcasts", lever: "reputation", job: "disc", tier: "T2/T3", check: "judged",
    anchors: `0 = none. 3 = niche-only (marquee in-category, zero generalist reach), or intros bind the wrong entity. 5 = repeat marquee in-category plus generalist shows, introduced with the right entity binding. Interpolate 1,2,4.`,
  },
  {
    id: "youtube", lever: "reputation", job: "disc", tier: "T2", check: "judged",
    anchors: `0 = absent both sides (owned + earned). 3 = one side only (active channel nobody covers, or coverage with no owned presence). 5 = active owned channel + third-party coverage, transcripts available. Interpolate 1,2,4.`,
  },
  {
    id: "executive_social", lever: "reputation", job: "disc", tier: "T2/T3", check: "judged",
    anchors: `FULL LADDER (substance x reach; LinkedIn-led, X is a ledger note): 0 = no founder/exec presence. 1 = profile exists, dormant or pure reposts. 2 = sporadic, announcement-only posts. 3 = semi-regular posting, some substance on category topics, modest reach. 4 = consistent substantive content on the category, real audience. 5 = consistent article-grade founder content on category topics with meaningful reach. Follower count informs 4 vs 5 but never gates below 3; substance leads.`,
  },
  {
    id: "review_sites", lever: "reputation", job: "both", tier: "T2", check: "judged",
    anchors: `FULL LADDER (presence x sentiment/quality) over third-party REVIEW and aggregator platforms, scoped to the profile-resolved set (lib/rubric.mjs VALIDATION_SOURCES: plg_saas = G2/Capterra/TrustRadius; enterprise_b2b = Gartner/Forrester/Peer Insights; dev_tool = GitHub/Product Hunt/Hacker News; crypto_infra = Messari/CoinGecko/CMC/CertiK; consumer = Trustpilot/app stores): 0 = absent from the set. 1 = listed on one source, stale or unrated. 2 = present on some, thin or aging, mixed signal. 3 = present across the set, current, neutral-to-positive. 4 = present and well-rated across most of the set, recent activity. 5 = present, current, and strongly rated across the set.`,
  },
  {
    id: "community_forums", lever: "reputation", job: "disc", tier: "T2-T3", check: "judged", conditional: ["dev_tool", "crypto_infra"],
    anchors: `FULL LADDER (mirrors reddit, scoped to HN/StackExchange/Discord-Discourse; tone is a depressor): 0 = a negative narrative dominates the relevant forums. 1 = no organic presence (only the brand's own channels), or a live negative thread alongside thin presence. 2 = thin, mostly self-referential, neutral. 3 = some genuine organic discussion, net-neutral. 4 = solid organic presence, net-positive, named correctly. 5 = frequent organic positive discussion in the high-trust forums for the niche.`,
  },
];

// Which facts file feeds each judged element.
export const FACTS_SOURCE = {
  company_home: "onsite", offering_home: "onsite", branded_faq: "onsite",
  original_research_data: "onsite", category_guides: "onsite", comparison_pages: "onsite",
  case_studies: "onsite", content_engine: "onsite", answer_structure: "onsite",
  pricing_transparency: "onsite", developer_docs: "onsite",
  name_binding: "offsite", directory_consistency: "offsite", wikipedia_wikidata: "offsite",
  press_earned_media: "offsite", category_pub_mentions: "offsite", review_sites: "offsite",
  reddit: "offsite", podcasts: "offsite", youtube: "offsite",
  executive_social: "offsite", community_forums: "offsite",
};

export function applicable(el, profiles) {
  if (!el.conditional) return true;
  return el.conditional.some((p) => profiles.includes(p));
}
