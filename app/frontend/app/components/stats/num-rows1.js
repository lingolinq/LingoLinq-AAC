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
  totalSessionsDisplay: computed('displayTotalSessions', 'usage_stats.total_sessions', function() {
    var d = this.get('displayTotalSessions');
    return d !== undefined && d !== null ? d : this.get('usage_stats.total_sessions');
  }),
  totalWordsDisplay: computed('displayTotalWords', 'usage_stats.total_words', function() {
    var d = this.get('displayTotalWords');
    return d !== undefined && d !== null ? d : this.get('usage_stats.total_words');
  }),
});
