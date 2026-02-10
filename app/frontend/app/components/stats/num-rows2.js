import Component from '@ember/component';
import LingoLinq from '../../app';
import i18n from '../../utils/i18n';
import { htmlSafe } from '@ember/template';
import { computed } from '@ember/object';

export default Component.extend({
  elem_style: computed('right_side', function() {
    if(this.get('right_side')) {
      return htmlSafe('border-left: 1px solid #eee;');
    } else {
      return htmlSafe('');
    }
  }),
  totalUtterancesDisplay: computed('displayTotalUtterances', 'usage_stats.total_utterances', function() {
    var d = this.get('displayTotalUtterances');
    return d !== undefined && d !== null ? d : this.get('usage_stats.total_utterances');
  }),
  totalButtonsDisplay: computed('displayTotalButtons', 'usage_stats.total_buttons', function() {
    var d = this.get('displayTotalButtons');
    return d !== undefined && d !== null ? d : this.get('usage_stats.total_buttons');
  }),
});
