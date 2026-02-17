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
  wordsPerUtteranceDisplay: computed('displayWordsPerUtterance', 'usage_stats.words_per_utterance', function() {
    var d = this.get('displayWordsPerUtterance');
    return d !== undefined && d !== null ? d : this.get('usage_stats.words_per_utterance');
  }),
  wordsPerMinuteDisplay: computed('displayWordsPerMinute', 'usage_stats.words_per_minute', function() {
    var d = this.get('displayWordsPerMinute');
    return d !== undefined && d !== null ? d : this.get('usage_stats.words_per_minute');
  }),
});
