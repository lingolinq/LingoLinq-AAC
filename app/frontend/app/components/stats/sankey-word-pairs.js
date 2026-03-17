import Component from '@ember/component';
import { htmlSafe } from '@ember/template';
import { computed } from '@ember/object';

export default Component.extend({
  // Forward wordPairsData from parent (controller passes wordPairsForSankey/wordPairsForSankey2)
  chartData: computed('wordPairsData', function() {
    return this.get('wordPairsData') || [];
  }),
  elem_class: computed('side_by_side', function() {
    if (this.get('side_by_side')) {
      return htmlSafe('col-sm-6 col-xs-12');
    } else {
      return htmlSafe('col-sm-8 col-xs-12');
    }
  }),
  elem_style: computed('right_side', function() {
    if (this.get('right_side')) {
      return htmlSafe('break-inside: avoid; border-left: 1px solid #eee;');
    } else {
      return htmlSafe('break-inside: avoid;');
    }
  })
});
