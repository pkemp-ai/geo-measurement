// Importance layer (framework v2.3+): theory (tier prior) x practice (observed
// citation share), scaled to 1-5, and the priority = importance x gap ranking.
// Extracted from score-levers.mjs so the scoring stage (score-elements.mjs) and
// the importance stage (score-importance.mjs) are separate, testable steps.
//
//   importance = 1 + 4 * (w_global * tier_prior + w_local * observed_share)
//   priority   = importance * (5 - audit_score)
//
// computeImportance(result, {classified, graded, profiles}) mutates `result`
// (the levers.json object) in place, attaching importance/local_evidence/priority
// per element and priorities/verify_first/importance_config at the top level.
// buildImportanceMatrix(result) projects the scored+importance result into the
// standalone importance.json matrix (one row per element x applicable job).

import { IMPORTANCE, LOCAL_SIGNAL, VALIDATION_SOURCES, VALIDATION_DOMAINS } from "./rubric.mjs";

const round1 = (x) => Math.round(x * 10) / 10;
const tracksFor = (job) => job === "disc" ? ["discoverability"] : job === "assess" ? ["assessment"] : ["discoverability", "assessment"];
const prior = (tier) => IMPORTANCE.tier_prior[tier] ?? IMPORTANCE.tier_prior_default;
const isIndeterminate = (e) => e.indeterminate === true || /indeterminate/i.test(e.rationale ?? "");

// Page-role of a vendor-owned citation (own_domain or competitor), by URL path.
// INTERNAL computation only — page-role detail never reaches the client deliverable;
// it just sharpens which own-content element an observed vendor citation evidences.
export const pageRole = (c) => {
  let path = ""; try { path = new URL(c.url).pathname.toLowerCase(); } catch {}
  const h = (c.host ?? "").toLowerCase();
  const t = `${c.title ?? ""} ${path}`.toLowerCase();
  if (/\bvs\b|vs\.|versus|alternativ|compar/.test(t)) return "comparison";
  if (/^(docs|developers?|api)\./.test(h) || /\/(docs|api-reference|reference)(\/|$)/.test(path)) return "docs";
  if (/\/(blog|insights?|news|newsroom|posts?)(\/|$)/.test(path)) return "blog_news";
  if (/\/(about|company|team|who-we-are|leadership)(\/|$)/.test(path)) return "company";
  if (/\/pricing/.test(path)) return "pricing";
  if (/\/(case-stud|customers?|success-stor)/.test(path)) return "case_studies";
  if (/(research|reports?|transparen|attestation|whitepaper)/.test(path)) return "research_trust";
  if (/\/(guides?|learn|academy|glossary)(\/|$)/.test(path)) return "guides";
  if (/\/faq/.test(path)) return "faq";
  if (path === "/" || path === "") return "home";
  return "product";
};

export function trackSignals(track, { classified, profiles }) {
  const tr = classified.filter((r) => r.track === track);
  const valDomains = [...new Set(profiles.flatMap((p) => (VALIDATION_SOURCES[p] ?? []).flatMap((s) => VALIDATION_DOMAINS[s] ?? [])))];
  const sig = { total: 0, cls: {}, roles: {}, vendor: 0, validation: 0 };
  for (const r of tr) for (const c of r.citations ?? []) {
    sig.total++;
    sig.cls[c.source_type] = (sig.cls[c.source_type] ?? 0) + 1;
    if (c.source_type === "own_domain" || c.source_type === "competitor") {
      sig.vendor++;
      const role = pageRole(c);
      sig.roles[role] = (sig.roles[role] ?? 0) + 1;
    }
    if (valDomains.some((d) => c.host === d || (c.host ?? "").endsWith("." + d))) sig.validation++;
  }
  return sig;
}

export function localSignal(id, sig, { graded }) {
  const classes = LOCAL_SIGNAL[id] ?? [];
  if (classes[0] === "harm:wrong_entity") {
    // name_binding: importance scales with observed harm, not citation share.
    const assess = graded.filter((r) => r.track === "assessment");
    const bad = assess.filter((r) => (r.flags ?? []).some((f) => /wrong_entity|conflat/i.test(f))).length;
    return { share: assess.length ? Math.min(1, (bad / assess.length) * 3) : 0, cited: bad, total: assess.length, classes: ["wrong_entity_rate"] };
  }
  if (!sig.total || !classes.length) return { share: 0, cited: 0, total: sig.total, classes };
  const count = (k) =>
    k === "vendor_all" ? sig.vendor :
    k === "validation_domains" ? sig.validation :
    k.startsWith("role:") ? (sig.roles[k.slice(5)] ?? 0) :
    (sig.cls[k] ?? 0);
  const cited = classes.reduce((a, k) => a + count(k), 0);
  // Normalize relative to the dominant citation class in THIS track's answers.
  const maxCount = Math.max(sig.vendor, ...Object.values(sig.cls), 1);
  return { share: Math.min(1, cited / maxCount), cited, total: sig.total, classes };
}

// Mutates `result` (the levers.json object): attaches per-element importance +
// local_evidence + priority, and top-level priorities + verify_first + importance_config.
export function computeImportance(result, { classified, graded, profiles }) {
  const sigs = {
    discoverability: trackSignals("discoverability", { classified, profiles }),
    assessment: trackSignals("assessment", { classified, profiles }),
  };
  const priorities = { discoverability: [], assessment: [] };
  for (const [lever, obj] of Object.entries(result.levers)) {
    for (const [id, e] of Object.entries(obj.elements)) {
      // Unknown is not a gap (also catches pre-v2.3 levers.json).
      const indeterminate = isIndeterminate(e);
      const g = prior(e.tier);
      e.importance = {}; e.local_evidence = {};
      let best = 0;
      for (const track of tracksFor(e.job)) {
        const ls = localSignal(id, sigs[track], { graded });
        const raw = IMPORTANCE.w_global * g + IMPORTANCE.w_local * ls.share;
        const I = round1(1 + 4 * raw);
        e.importance[track] = I;
        e.local_evidence[track] = ls;
        if (Number.isInteger(e.score) && !indeterminate) {
          const gap = 5 - e.score;
          const P = round1(I * gap);
          priorities[track].push({ element: id, lever, priority: P, importance: I, score: e.score, gap });
          best = Math.max(best, P);
        }
      }
      e.priority = indeterminate ? null : best;
      if (indeterminate) e.verify_first = true;
    }
  }
  for (const t of Object.keys(priorities)) priorities[t] = priorities[t].filter((p) => p.priority > 0).sort((a, b) => b.priority - a.priority);
  result.priorities = priorities;
  result.verify_first = Object.values(result.levers).flatMap((o) => Object.entries(o.elements).filter(([, e]) => e.verify_first).map(([id]) => id));
  result.importance_config = { w_global: IMPORTANCE.w_global, w_local: IMPORTANCE.w_local, computed_at: new Date().toISOString() };
  return result;
}

// Projects the scored + importance-computed result into the standalone matrix.
// research_importance = 1+4*tier_prior (theory, fixed across clients);
// run_importance = 1+4*observed_share (this run); blended = the stored importance.
// Call AFTER computeImportance so local_evidence/importance are populated.
export function buildImportanceMatrix(result) {
  const rows = [];
  for (const [lever, obj] of Object.entries(result.levers)) {
    for (const [id, e] of Object.entries(obj.elements)) {
      const research = round1(1 + 4 * prior(e.tier));
      const indeterminate = isIndeterminate(e);
      const scored = Number.isInteger(e.score);
      for (const track of tracksFor(e.job)) {
        const ls = e.local_evidence?.[track] ?? { share: 0 };
        const blended = e.importance?.[track] ?? null;
        rows.push({
          lever,
          dimension: id,
          job: track === "discoverability" ? "Discoverability" : "Assessment",
          tier: e.tier,
          basis: e.basis ?? null,
          audit_score: scored ? e.score : null,
          research_importance: research,
          run_importance: round1(1 + 4 * (ls.share ?? 0)),
          blended_importance: blended,
          gap: scored && !indeterminate ? 5 - e.score : null,
          priority: (scored && !indeterminate && blended != null) ? round1(blended * (5 - e.score)) : null,
          local_evidence: ls,
          flags: [e.needs_review ? "needs_review" : null, indeterminate ? "verify_first" : null].filter(Boolean),
        });
      }
    }
  }
  return {
    matrix: rows,
    priorities: result.priorities,
    verify_first: result.verify_first,
    importance_config: result.importance_config,
  };
}
