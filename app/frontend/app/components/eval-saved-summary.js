import Component from '@ember/component';
import { computed } from '@ember/object';
import i18n from '../utils/i18n';

/*
 * eval-saved-summary — renders the saved tiered-eval data on the
 * user.log detail page when log.tiered_eval is present. Mirrors the
 * eval-quick-report layout (recommendation summary + targeted_report
 * block) so an SLP returning to a saved eval gets the same view they
 * had during the live flow.
 */
export default Component.extend({
  tagName: 'section',
  classNames: ['evq-saved'],
  log: null,

  payload: computed('log.tiered_eval', function() {
    return this.get('log.tiered_eval') || {};
  }),
  recommendation: computed('payload.recommendation', function() {
    return this.get('payload.recommendation') || {};
  }),
  isTargeted: computed('payload.eval_mode', function() {
    const m = this.get('payload.eval_mode');
    return m === 'targeted' || m === 'comprehensive';
  }),
  isComprehensive: computed('payload.eval_mode', function() {
    return this.get('payload.eval_mode') === 'comprehensive';
  }),
  modeLabel: computed('payload.eval_mode', function() {
    const m = this.get('payload.eval_mode');
    if (m === 'comprehensive') {
      return i18n.t('saved_eval_mode_comprehensive', "Comprehensive Eval (15 min)");
    }
    if (m === 'targeted') {
      return i18n.t('saved_eval_mode_targeted', "Targeted Eval (10 min)");
    }
    return i18n.t('saved_eval_mode_quick', "Quick Screen (5 min)");
  }),
  durationLabel: computed('log.duration', function() {
    const seconds = parseInt(this.get('log.duration'), 10) || 0;
    const minutes = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return i18n.t('saved_eval_duration', "%{m}m %{s}s", { m: minutes, s: sec });
  }),
  confidencePct: computed('recommendation.confidence', function() {
    return Math.round((this.get('recommendation.confidence') || 0) * 100);
  }),
  gridLabel: computed('recommendation.grid_size', function() {
    const grid = this.get('recommendation.grid_size');
    if (!grid) { return ''; }
    return i18n.t('saved_eval_grid_label', "%{rows} × %{cols} (%{band})", { rows: grid.rows, cols: grid.cols, band: grid.band });
  }),
  fringeCategories: computed('recommendation.vocab_recommendation.fringe_categories', function() {
    return this.get('recommendation.vocab_recommendation.fringe_categories') || [];
  }),
  intake: computed('payload.intake', function() {
    return this.get('payload.intake') || {};
  }),
  slpNotes: computed('payload.slp_notes', function() {
    const notes = this.get('payload.slp_notes');
    return notes && notes.length ? notes : null;
  }),

  // Targeted-report passthroughs (mirror eval-quick-report).
  targetedReport: computed('recommendation.targeted_report', function() {
    return this.get('recommendation.targeted_report') || {};
  }),
  adaptiveGridReport: computed('targetedReport.adaptive_grid', function() {
    return this.get('targetedReport.adaptive_grid') || null;
  }),
  library3wayReport: computed('targetedReport.library_3way', function() {
    return this.get('targetedReport.library_3way') || null;
  }),
  accessCoTrialReport: computed('targetedReport.access_co_trial', function() {
    return this.get('targetedReport.access_co_trial') || null;
  }),
  syntaxProbeReport: computed('targetedReport.syntax_probe', function() {
    return this.get('targetedReport.syntax_probe') || null;
  }),
  motorMapReport: computed('targetedReport.motor_map', function() {
    return this.get('targetedReport.motor_map') || null;
  }),
  motorMapHits: computed('motorMapReport.hit_locations', function() {
    return this.get('motorMapReport.hit_locations') || [];
  }),
  motorMapAccuracyPct: computed('motorMapReport.accuracy', function() {
    const a = this.get('motorMapReport.accuracy');
    return a == null ? null : Math.round(a * 100);
  }),
  syntaxReceptivePct: computed('syntaxProbeReport.receptive_accuracy', function() {
    const a = this.get('syntaxProbeReport.receptive_accuracy');
    return a == null ? null : Math.round(a * 100);
  }),
  syntaxExpressivePct: computed('syntaxProbeReport.expressive_accuracy', function() {
    const a = this.get('syntaxProbeReport.expressive_accuracy');
    return a == null ? null : Math.round(a * 100);
  }),
  libraryPicksList: computed('library3wayReport.picks', function() {
    const picks = this.get('library3wayReport.picks') || {};
    return Object.keys(picks).map(function(k) {
      return { id: k, count: picks[k] };
    });
  }),
  accessSummaryList: computed('accessCoTrialReport.tallies', function() {
    const tallies = this.get('accessCoTrialReport.tallies') || {};
    return Object.keys(tallies).map(function(k) {
      const t = tallies[k];
      const attempts = (t.hits || 0) + (t.misses || 0);
      const accuracy = attempts ? Math.round((t.hits / attempts) * 100) : null;
      return { method: k, attempts: attempts, accuracy: accuracy, hits: t.hits || 0 };
    });
  }),

  // Comprehensive (Mode 3) — additional report data when this saved
  // eval was promoted all the way through DA + literacy + SETT + AI.
  comprehensiveReport: computed('recommendation.comprehensive_report', function() {
    return this.get('recommendation.comprehensive_report') || {};
  }),
  daSummary: computed('comprehensiveReport.dynamic_assessment', function() {
    return this.get('comprehensiveReport.dynamic_assessment') || null;
  }),
  literacySummary: computed('comprehensiveReport.literacy_probe', function() {
    return this.get('comprehensiveReport.literacy_probe') || null;
  }),
  literacyAccuracyPct: computed('literacySummary.accuracy', function() {
    const a = this.get('literacySummary.accuracy');
    return a == null ? null : Math.round(a * 100);
  }),
  comprehensiveSett: computed('comprehensiveReport.sett', function() {
    return this.get('comprehensiveReport.sett') || null;
  }),
  aiNarrative: computed('payload.ai_narrative', function() {
    return this.get('payload.ai_narrative');
  })
});
