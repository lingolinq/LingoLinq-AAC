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
  utterancesPerMinuteDisplay: computed('displayUtterancesPerMinute', 'usage_stats.utterances_per_minute', function() {
    var d = this.get('displayUtterancesPerMinute');
    return d !== undefined && d !== null ? d : this.get('usage_stats.utterances_per_minute');
  }),
  buttonsPerMinuteDisplay: computed('displayButtonsPerMinute', 'usage_stats.buttons_per_minute', function() {
    var d = this.get('displayButtonsPerMinute');
    return d !== undefined && d !== null ? d : this.get('usage_stats.buttons_per_minute');
  }),
});
