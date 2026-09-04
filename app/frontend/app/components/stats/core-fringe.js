import Component from '@ember/component';
import i18n from '../../utils/i18n';
import { htmlSafe } from '@ember/template';
import { computed } from '@ember/object';
import { count_for, percent_label, percent_of } from '../../utils/proportions';

export default Component.extend({
  elem_class: computed('side_by_side', function() {
    if(this.get('side_by_side')) {
      return htmlSafe('col-sm-6 col-xs-6');
    } else {
      // Full width on phones: a half-width column leaves the chart ~140px across,
      // which crushes the labels. Compare mode (above) keeps two per row on
      // purpose, since the whole point there is side-by-side reading.
      return htmlSafe('col-sm-4 col-xs-12');
    }
  }),
  elem_style: computed('right_side', function() {
    if(this.get('right_side')) {
      return htmlSafe('break-inside: avoid; border-left: 1px solid #eee;');
    } else {
      return htmlSafe('break-inside: avoid;');
    }
  }),
  // Two parts of one whole, so this is a single proportion bar rather than a
  // list of bars: the reader's question is "how much of it is core?", which one
  // headline percentage answers outright. `draw_id` is in the dependent keys
  // because the controller bumps it to force a redraw after a filter change.
  proportion: computed(
    'usage_stats.{draw_id,modeling,core_words,modeled_core_words}',
    function() {
      var stats = this.get('usage_stats');
      var parts = stats && (stats.get('modeling') ? stats.get('modeled_core_words') : stats.get('core_words'));
      var core = count_for(parts, 'core');
      var fringe = count_for(parts, 'not_core');
      var total = core + fringe;
      if(total === 0) { return {has_data: false}; }

      var core_percent = percent_of(core, total);
      var fringe_percent = percent_of(fringe, total);
      var core_label = i18n.t('core_label', "Core");
      var fringe_label = i18n.t('fringe_label', "Fringe");
      return {
        has_data: true,
        core: core,
        fringe: fringe,
        core_label: core_label,
        fringe_label: fringe_label,
        core_percent_label: percent_label(core_percent),
        fringe_percent_label: percent_label(fringe_percent),
        core_style: htmlSafe('width: ' + core_percent + '%;'),
        fringe_style: htmlSafe('width: ' + fringe_percent + '%;'),
        // The track is decorative on its own — this sentence is what a screen
        // reader announces in its place.
        // ONE LINE on purpose: i18n_generator.rb parses `i18n.t(` line by line and
        // needs the closing paren on the same line (:109-127), so a wrapped call
        // is reported "== MISSING ==" and blocks generation entirely.
        summary: i18n.t('core_fringe_summary', "%{core_percent} of words used were core words, %{fringe_percent} were fringe words.", {core_percent: percent_label(core_percent), fringe_percent: percent_label(fringe_percent)})
      };
    }
  )
});
