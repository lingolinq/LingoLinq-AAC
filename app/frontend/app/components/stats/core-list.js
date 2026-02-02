import Component from '@ember/component';
import { htmlSafe } from '@ember/template';
import { computed } from '@ember/object';

export default Component.extend({
  elem_class: computed('side_by_side', function() {
    if(this.get('side_by_side')) {
      return htmlSafe('col-sm-6');
    } else {
      return htmlSafe('col-sm-4');
    }
  }),
  elem_style: computed('right_side', function() {
    if(this.get('right_side')) {
      return htmlSafe('border-left: 1px solid #eee;');
    } else {
      return htmlSafe('');
    }
  }),
  core_words: computed(
    'core',
    'usage_stats',
    'usage_stats.{weighted_words,usage_stats.draw_id}',
    function() {
      var res = [];
      var words = this.get('core.for_user') || [];
      var available = {};
      (this.get('core.reachable_for_user') || []).forEach(function(word) {
        available[word] = true;
      });
      var weighted = this.get('usage_stats.weighted_words') || [];
      words.forEach(function(word) {
        var weight = 'weighted_word weight_0';
        if(available[word]) {
          var found = weighted.find(function(w) { return w.text.toLowerCase() == word.toLowerCase(); });
          weight = found ? found.weight_class : 'weighted_word weight_1';
        }
        res.push({
          text: word,
          weight_class: weight
        });
      });
      return res;
    }
  ),
  actions: {
    word_cloud: function() {
      if (this.word_cloud) {
        this.word_cloud();
      }
    },
    word_data: function(word) {
      if (this.word_data) {
        this.word_data(word);
      }
    },
    modify_core: function() {
      if (this.modify_core) {
        this.modify_core();
      }
    }
  }
});
//   {{#each core_words as |word|}}
//     <span class={{word.weight_class}}>{{word.text}}</span>
//   {{/each}}
