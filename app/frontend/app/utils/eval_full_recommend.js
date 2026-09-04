/*
 * eval_full_recommend — turns an ANALYZED full-eval assessment (the object
 * `utils/eval.js#analyze` returns, rendered on user.log / last-eval) into the
 * same recommendation shape the tiered Quick/Targeted/Comprehensive flow
 * produces in `eval_recommend.js`.
 *
 * Why an adapter instead of reusing eval_recommend directly: the two evals
 * record completely different event shapes. The tiered flow emits flat
 * `{subtest, response, latency_ms, grid}` events; the full eval emits
 * per-level arrays of `{correct, crow, ccol, rows, cols, time, library}` that
 * `analyze()` has already reduced to aggregates (largest mastered grid, button
 * size in inches, per-library trial bars, literacy responses). Feeding raw
 * full-eval events through `fromQuickScreen` would score nothing. So we map
 * the ANALYSIS, and reuse eval_recommend's GRID_BANDS + recommended_home_board's
 * Vocal Flair mapping so both evals recommend page sets by one rule.
 *
 * GRID DIFFERENCE — deliberate. The Quick Screen extrapolates upward: probes
 * top out at 4x6, so 24 demonstrated cells recommends the 84-button band. The
 * full eval does NOT extrapolate — it tests 1x2 → 8x14 directly (see the level
 * tables in eval.js: the 24 / 60 / 112 clusters are 4x6, 6x10, 8x14) and
 * `analyze()` reports the largest grid actually MASTERED at the assessment's
 * own mastery cutoff. Extrapolating past that would contradict the eval's own
 * finding that the next size up was not mastered, so the demonstrated grid IS
 * the recommendation here.
 *
 * Pure functions — no Ember, no DOM, no i18n. User-facing strings are built by
 * the component (components/eval-full-report.js), same split as eval_recommend.
 * The Vocal Flair lookup is likewise left to the component, so this module's
 * only import is eval_recommend and it stays runnable outside an Ember build.
 */

import eval_recommend from './eval_recommend';

// Full-eval access keys (assessment.access_method, surfaced by analyze() as
// access_method_key) → the three channels the goals grid and feature-match
// language understand.
const ACCESS_CHANNELS = {
  touch: 'touch',
  scanning: 'scan',
  axis_scanning: 'scan',
  dwell: 'gaze',
  arrow_dwell: 'gaze',
  head: 'gaze'
};

// Trial counts at which the evidence base is worth describing differently.
// This is a data-volume statement ONLY — how much the eval saw, not how
// clinically certain the recommendation is. Deliberately not called
// "confidence": the tiered flow's confidence score is computed from a known
// fixed subtest battery, and the full eval has no equivalent denominator.
const EVIDENCE_BANDS = [
  { min: 40, strength: 'strong' },
  { min: 15, strength: 'moderate' },
  { min: 0,  strength: 'limited' }
];

// NOTE: the list of report sections an eval CANNOT capture (non-SGD rule-outs,
// less-costly trials, attestations, SETT, PLAAFP…) lives in utils/eval_workbook
// as WORKBOOK_SECTIONS, because those sections are now filled in rather than
// merely listed. One source for "what a report still needs".

function accessChannel(key) {
  return ACCESS_CHANNELS[key] || 'touch';
}

// The largest grid the communicator actually mastered.
//
// No band label: GRID_BANDS' `band` names describe the Quick Screen's
// EXTRAPOLATION from a small probe to a larger recommended board, and applying
// them here would contradict the number beside them — a mastered 4x6 is the
// GRID_BANDS 24-button row, whose label is 'tiny', which is not what "you
// mastered the 24-button grid" means. GRID_BANDS is still the shared source for
// which published board sizes exist (rows/cols pairs); only the extrapolation
// labels are dropped.
function recommendedGrid(analysis) {
  const rows = parseInt(analysis.grid_height, 10) || 0;
  const cols = parseInt(analysis.grid_width, 10) || 0;
  if (!rows || !cols) { return null; }
  const cells = rows * cols;
  const published = eval_recommend.GRID_BANDS.some(function(b) { return b.rows === rows && b.cols === cols; });
  return { rows: rows, cols: cols, cells: cells, published: published };
}

function evidenceStrength(trials) {
  const band = EVIDENCE_BANDS.find(function(b) { return trials >= b.min; });
  return band ? band.strength : 'limited';
}

// analyze() builds symbol_libraries only from trials that carried a library
// (the `symbols` level plus small-field diff_target trials). One entry means
// no comparison happened — report it as "the library used", never as a winner.
function libraryResult(analysis) {
  const list = analysis.symbol_libraries || [];
  if (!list.length) { return null; }
  const ranked = list.slice().sort(function(a, b) {
    if ((b.pct || 0) !== (a.pct || 0)) { return (b.pct || 0) - (a.pct || 0); }
    return (a.avg_response || 0) - (b.avg_response || 0);
  });
  const top = ranked[0];
  const runner = ranked[1];
  return {
    name: top.name,
    pct: top.pct,
    avg_response: top.avg_response,
    compared: ranked.length > 1,
    margin: runner ? (top.pct || 0) - (runner.pct || 0) : null,
    ranked: ranked.map(function(r) { return { name: r.name, pct: r.pct, avg_response: r.avg_response }; })
  };
}

function literacyResult(analysis) {
  const rows = analysis.literacy_responses || [];
  if (!rows.length) { return null; }
  const correct = rows.filter(function(r) { return r.correct; }).length;
  return {
    trials: rows.length,
    correct: correct,
    pct: Math.round((correct / rows.length) * 100)
  };
}

// Open-ended prompts are the only place the full eval captures composed
// output, so the longest response is our one direct sample of expressive
// length.
function expressiveResult(analysis) {
  const sections = analysis.open_ended_sections || [];
  if (!sections.length) { return null; }
  let max = 0;
  let longest = '';
  sections.forEach(function(s) {
    const words = String(s.sentence || '').trim().split(/\s+/).filter(Boolean);
    if (words.length > max) { max = words.length; longest = s.sentence; }
  });
  return { prompts: sections.length, max_words: max, longest: longest };
}

// Drives which goal templates eval_goals_grid picks. HEURISTIC, and it only
// ever selects SUGGESTED goal wording the SLP edits — it is not reported as a
// language-level finding, and no clinical claim is made from it.
function vocabBand(literacy, expressive) {
  if (expressive && expressive.max_words >= 3) { return 'advanced'; }
  if ((expressive && expressive.max_words >= 1) || (literacy && literacy.pct >= 50)) { return 'established'; }
  return 'emerging';
}

export function fromFullEval(analysis) {
  analysis = analysis || {};

  const grid = recommendedGrid(analysis);
  const library = libraryResult(analysis);
  const literacy = literacyResult(analysis);
  const expressive = expressiveResult(analysis);
  const trials = parseInt(analysis.total_possibly_correct, 10) || 0;
  const buttonWidth = parseFloat(analysis.button_width) || 0;
  const buttonHeight = parseFloat(analysis.button_height) || 0;

  return {
    source: 'full_eval',
    access_method: accessChannel(analysis.access_method_key),
    access_label: analysis.access_method || null,
    grid_size: grid,
    button_size: (buttonWidth && buttonHeight) ? {
      width: buttonWidth,
      height: buttonHeight,
      approximate: !!analysis.approximate
    } : null,
    field_size: parseInt(analysis.field, 10) || null,
    library: library,
    literacy: literacy,
    expressive: expressive,
    vocab_recommendation: { band: vocabBand(literacy, expressive) },
    trials: trials,
    hits: parseInt(analysis.hits, 10) || 0,
    accuracy_pct: parseInt(analysis.avg_accuracy, 10) || 0,
    avg_response_seconds: parseFloat(analysis.avg_response_time) || 0,
    evidence_strength: evidenceStrength(trials)
  };
}

export default {
  fromFullEval: fromFullEval,
  ACCESS_CHANNELS: ACCESS_CHANNELS,
  EVIDENCE_BANDS: EVIDENCE_BANDS
};
