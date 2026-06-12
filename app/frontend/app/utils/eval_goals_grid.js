/*
 * eval_goals_grid — DAGG-style goal grid generator. Maps the
 * recommendation + comprehensive_report to suggested IEP goals
 * across Janice Light's four communicative competencies:
 *   linguistic   — vocabulary, syntax, semantic relationships
 *   operational  — access method, motor planning, device navigation
 *   social       — communication partner skills, turn-taking
 *   strategic    — repair, alternative methods, advocacy
 *
 * The DAGG (Dynamic AAC Goals Grid, Tobii Dynavox) is the closest
 * commercial analog — this utility produces a similar table format,
 * driven by the recommendation data the LingoLinq eval engine
 * already produces. Pure functions, no DOM.
 */

const LINGUISTIC_TEMPLATES = {
  emerging:    [{ text: 'Increase single-symbol vocabulary by 5 words per week.',   evidence_field: 'vocab_recommendation.band' },
                { text: 'Combine two symbols to make a request.',                    evidence_field: 'communicator_stage' }],
  established: [{ text: 'Increase three-symbol utterances by 10% over baseline.',   evidence_field: 'vocab_recommendation.band' },
                { text: 'Use core vocabulary across at least 4 communication functions (request, comment, reject, ask).', evidence_field: 'vocab_recommendation.core' }],
  advanced:    [{ text: 'Produce grammatically complete sentences using 4–5 word combinations.', evidence_field: 'vocab_recommendation.band' }]
};

const OPERATIONAL_TEMPLATES = {
  touch: [{ text: 'Locate target buttons on a %{rows}×%{cols} grid with 80% accuracy.', evidence_field: 'grid_size' },
          { text: 'Navigate from home board to a category folder and back independently.', evidence_field: 'grid_size' }],
  scan:  [{ text: 'Activate scanning switch with %{rows}×%{cols} grid layout, target accuracy 80% within 5 seconds.', evidence_field: 'grid_size' }],
  gaze:  [{ text: 'Sustain gaze 1.5s for activation on %{rows}×%{cols} grid with 80% accuracy.', evidence_field: 'grid_size' }]
};

const SOCIAL_TEMPLATES = [
  { text: 'Initiate at least 3 communicative turns per 10-minute interaction.',                 evidence_field: null },
  { text: 'Respond to a partner question with at least 1 device-mediated turn within 10s.',     evidence_field: null }
];

const STRATEGIC_TEMPLATES = [
  { text: 'Repair a communication breakdown using a second access method or symbol library.',  evidence_field: 'access_secondary' },
  { text: 'Request help from a communication partner when an intended word is unavailable.',    evidence_field: null }
];

function interpolate(text, recommendation) {
  return text.replace(/%\{([^}]+)\}/g, function(_, key) {
    if (key === 'rows' || key === 'cols') {
      const grid = recommendation.grid_size || {};
      return String(grid[key] || '?');
    }
    const path = key.split('.');
    let v = recommendation;
    for (let i = 0; i < path.length; i++) {
      if (v == null) { return ''; }
      v = v[path[i]];
    }
    return v == null ? '' : String(v);
  });
}

function pickLinguisticBand(recommendation) {
  const band = (recommendation.vocab_recommendation || {}).band;
  if (band === 'phrase' || band === 'sentence' || band === 'advanced') { return 'advanced'; }
  if (band === 'established' || band === 'expanded') { return 'established'; }
  return 'emerging';
}

function pickOperationalChannel(recommendation) {
  const m = recommendation.access_method;
  if (m === 'gaze' || m === 'eye_gaze') { return 'gaze'; }
  if (m === 'scan' || m === 'switch')   { return 'scan'; }
  return 'touch';
}

export function generateGoalsGrid(recommendation) {
  recommendation = recommendation || {};
  const ling = LINGUISTIC_TEMPLATES[pickLinguisticBand(recommendation)] || LINGUISTIC_TEMPLATES.emerging;
  const op   = OPERATIONAL_TEMPLATES[pickOperationalChannel(recommendation)] || OPERATIONAL_TEMPLATES.touch;
  const soc  = SOCIAL_TEMPLATES;
  const strat = STRATEGIC_TEMPLATES;

  function build(category, templates) {
    return {
      category: category,
      goals: templates.map(function(t) {
        return {
          text: interpolate(t.text, recommendation),
          evidence_field: t.evidence_field
        };
      })
    };
  }

  return [
    build('linguistic', ling),
    build('operational', op),
    build('social', soc),
    build('strategic', strat)
  ];
}

export default {
  generateGoalsGrid: generateGoalsGrid,
  LINGUISTIC_TEMPLATES: LINGUISTIC_TEMPLATES,
  OPERATIONAL_TEMPLATES: OPERATIONAL_TEMPLATES,
  SOCIAL_TEMPLATES: SOCIAL_TEMPLATES,
  STRATEGIC_TEMPLATES: STRATEGIC_TEMPLATES
};
