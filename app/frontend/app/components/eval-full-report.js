import Component from '@ember/component';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';
import i18n from '../utils/i18n';
import goals_grid from '../utils/eval_goals_grid';
import { vocalFlairButtonsForGrid } from '../utils/recommended_home_board';
import eval_full_recommend from '../utils/eval_full_recommend';

/*
 * eval-full-report — the SLP-facing summary that sits on top of the full eval's
 * raw data tables (templates/user/log.hbs, including the /logs/last-eval page).
 *
 * The full eval already collected everything needed for a feature-match
 * statement — largest mastered grid, target size in inches, visual field,
 * access method + its settings, per-library accuracy, literacy and open-ended
 * responses — but the page only ever rendered it as trial tables. This turns
 * those aggregates into the same recommendation card the tiered Quick Eval
 * shows, plus the feature-match and goal language an eval report actually needs.
 *
 * MEDICAL vs SCHOOL is a real fork, not a display preference — see
 * docs/AAC_EVALUATION_STANDARDS.md §2. A funding report MUST name make/model;
 * an IEP MUST NOT, because naming a product in an IEP obligates the district to
 * it. So the recommended-page-set card is medical-mode only, and school mode
 * describes the same recommendation by feature instead.
 *
 * Derivation lives in utils/eval_full_recommend (pure); this component only
 * turns it into localized strings.
 */
export default Component.extend({
  appState: service('app-state'),
  tagName: 'section',
  classNames: ['evq-report', 'evq-report--full'],
  analysis: null,
  // The RAW eval blob and its log record — passed straight through to the
  // workbook, which writes back onto the eval this report was built from.
  assessment: null,
  log: null,
  user: null,

  // Medical/funding is the default because it is the superset — every section a
  // school report needs is present, plus the product-naming ones. Switching to
  // school mode removes what an IEP must not contain.
  reportMode: 'medical',

  recommendation: computed('analysis', function() {
    return eval_full_recommend.fromFullEval(this.get('analysis') || {});
  }),

  isSchoolMode: computed('reportMode', function() {
    return this.get('reportMode') === 'school';
  }),

  gridLabel: computed('recommendation.grid_size', function() {
    var grid = this.get('recommendation.grid_size');
    if (!grid) { return null; }
    // Kept on ONE line: i18n_generator.rb scans for the closing ")" on the same
    // line as the English string and counts the call MISSING without it, which
    // blocks generation of every locale file. See i18n_generator.rb:124-134.
    return i18n.t('full_report_grid_label', "%{rows} × %{cols} (%{cells} buttons)", {rows: grid.rows, cols: grid.cols, cells: grid.cells});
  }),

  buttonSizeLabel: computed('recommendation.button_size', function() {
    var size = this.get('recommendation.button_size');
    if (!size) { return null; }
    if (size.approximate) {
      return i18n.t('full_report_button_size_approx', "~%{w}\" × %{h}\"", { w: size.width, h: size.height });
    }
    return i18n.t('full_report_button_size', "%{w}\" × %{h}\"", { w: size.width, h: size.height });
  }),

  evidenceLabel: computed('recommendation.trials', 'recommendation.evidence_strength', function() {
    var rec = this.get('recommendation');
    return i18n.t('full_report_evidence', "%{n} scored trials", { n: rec.trials });
  }),

  accuracyLabel: computed('recommendation.accuracy_pct', function() {
    return i18n.t('full_report_accuracy', "%{p}% accuracy", { p: this.get('recommendation.accuracy_pct') });
  }),

  responseLabel: computed('recommendation.avg_response_seconds', function() {
    return i18n.t('full_report_response', "%{s}s avg. response", { s: this.get('recommendation.avg_response_seconds') });
  }),

  // The library card only means something when more than one library was
  // actually trialled AND the deployment still offers a choice. On a
  // single-library deployment (eval_single_library, on by default) there is no
  // choice to report — mirrors the same gate in eval-quick-report.
  librarySelectionActive: computed('appState.feature_flags.eval_single_library', 'recommendation.library.compared', function() {
    if (this.get('appState.feature_flags.eval_single_library')) { return false; }
    return !!this.get('recommendation.library.compared');
  }),

  // The Vocal Flair set matching the recommended grid — same one-rule mapping
  // the Quick Eval report uses, so both evals name the same page set for the
  // same grid.
  vocalFlairButtons: computed('recommendation.grid_size', function() {
    var grid = this.get('recommendation.grid_size');
    if (!grid) { return null; }
    return vocalFlairButtonsForGrid(grid);
  }),

  // Medical mode names the product; school mode must not, so the card is withheld
  // there.
  //
  // Corrected 2026-08-25: this said "required by LCD L33739 / A52469". L33739 does
  // NOT require it — naming the manufacturer, product name/number and HCPCS is
  // A52469's SUPPLIER CLAIM rule, binding on the claim the supplier submits, not an
  // element of the SLP's evaluation. The evaluation mandate is criterion 1 bullet 4,
  // "rationale for selection of a specific device and any accessories". Still name
  // the product in medical mode — the supplier's claim is denied without it — just
  // not on the grounds that the LCD demands it of us.
  //
  // The school-mode withholding stands, but its justification was also wrong and is
  // corrected here too. It said "naming a brand in an IEP obligates the district to
  // that product" as though federal law forbade it. It does not: ED's current
  // guidance (Myths and Facts Surrounding Assistive Technology Devices and Services,
  // OSEP/OET, Jan 2024) never uses the words "brand", "manufacturer" or "obligate",
  // and its Myth 6 says the opposite -- specific AT "must be included in the IEP".
  //
  // The real reason to withhold it is a different rule and a weaker one: 34 CFR
  // 300.323(d)/300.324 require the district to implement the IEP AS WRITTEN and
  // forbid unilateral change, so naming a product does bind them to it. Describing
  // by feature keeps the team's options open. That is a sound default and a
  // widespread state/district convention -- it is not a legal prohibition, and we
  // should not tell an SLP it is. See docs/AAC_EVALUATION_STANDARDS.md §2.
  showPageSetCard: computed('isSchoolMode', 'vocalFlairButtons', function() {
    return !this.get('isSchoolMode') && !!this.get('vocalFlairButtons');
  }),

  // Feature match (standards spine §3 item 12) — required features derived from
  // what the eval measured, each carrying its own evidence so the SLP can cite
  // it. Phrased by FEATURE, never by product, so the same list is valid in
  // either report mode.
  featureMatch: computed('recommendation', 'buttonSizeLabel', 'responseLabel', function() {
    var rec = this.get('recommendation');
    var rows = [];

    if (rec.grid_size) {
      rows.push({
        id: 'display',
        label: i18n.t('full_feature_display', "Display / grid capacity"),
        value: i18n.t('full_feature_display_value', "Supports at least a %{rows} × %{cols} grid (%{cells} buttons)", {rows: rec.grid_size.rows, cols: rec.grid_size.cols, cells: rec.grid_size.cells}),
        evidence: i18n.t('full_feature_display_evidence', "Largest grid mastered during the evaluation", {})
      });
    }
    if (rec.button_size) {
      rows.push({
        id: 'target_size',
        label: i18n.t('full_feature_target', "Target size"),
        value: this.get('buttonSizeLabel'),
        evidence: i18n.t('full_feature_target_evidence', "Smallest reliably-selected target", {})
      });
    }
    if (rec.field_size) {
      rows.push({
        id: 'field',
        label: i18n.t('full_feature_field', "Visual field"),
        value: i18n.t('full_feature_field_value', "Up to %{n} items on screen", { n: rec.field_size }),
        evidence: i18n.t('full_feature_field_evidence', "Largest field size mastered", {})
      });
    }
    if (rec.access_label) {
      rows.push({
        id: 'access',
        label: i18n.t('full_feature_access', "Selection method"),
        value: rec.access_label,
        evidence: i18n.t('full_feature_access_evidence', "Method used throughout this evaluation; settings listed below", {})
      });
    }
    rows.push({
      id: 'rate',
      label: i18n.t('full_feature_rate', "Response rate"),
      value: this.get('responseLabel'),
      evidence: i18n.t('full_feature_rate_evidence', "Mean latency across %{n} scored trials", { n: rec.trials })
    });
    if (rec.library) {
      rows.push({
        id: 'symbols',
        label: i18n.t('full_feature_symbols', "Symbol representation"),
        value: rec.library.compared ?
          i18n.t('full_feature_symbols_compared', "%{lib} (%{p}% accuracy — highest of %{n} libraries trialled)", {lib: rec.library.name, p: rec.library.pct, n: rec.library.ranked.length}) :
          i18n.t('full_feature_symbols_single', "%{lib} (%{p}% accuracy)", { lib: rec.library.name, p: rec.library.pct }),
        evidence: rec.library.compared ?
          i18n.t('full_feature_symbols_evidence_compared', "Per-library trial accuracy", {}) :
          i18n.t('full_feature_symbols_evidence_single', "Single library trialled — no comparison was run", {})
      });
    }
    if (rec.literacy) {
      rows.push({
        id: 'literacy',
        label: i18n.t('full_feature_literacy', "Text access"),
        value: i18n.t('full_feature_literacy_value', "%{c} of %{t} word-only items correct (%{p}%)", {c: rec.literacy.correct, t: rec.literacy.trials, p: rec.literacy.pct}),
        evidence: i18n.t('full_feature_literacy_evidence', "Literacy probes — words shown without symbols", {})
      });
    }
    if (rec.expressive) {
      rows.push({
        id: 'expressive',
        label: i18n.t('full_feature_expressive', "Composed output"),
        value: i18n.t('full_feature_expressive_value', "Longest response %{n} words across %{p} open-ended prompts", {n: rec.expressive.max_words, p: rec.expressive.prompts}),
        evidence: i18n.t('full_feature_expressive_evidence', "Open-ended prompt responses", {})
      });
    }
    return rows;
  }),

  goalsGrid: computed('recommendation', function() {
    return goals_grid.generateGoalsGrid(this.get('recommendation'));
  }),

  init() {
    this._super(...arguments);
    var self = this;
    this.ctrlAction = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function() {
        var args = bound.concat(Array.prototype.slice.call(arguments));
        var evt = args[args.length - 1];
        if (evt && typeof evt.preventDefault === 'function' && (evt.type || evt.target)) {
          if (evt.preventDefault) { evt.preventDefault(); }
          args.pop();
        }
        self.send.apply(self, [actionName].concat(args));
      };
    };
  },

  actions: {
    setMode: function(mode) {
      this.set('reportMode', mode === 'school' ? 'school' : 'medical');
    }
  }
});
