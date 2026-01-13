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
  inner_elem_style: computed('side_by_side', function() {
    if(this.get('side_by_side')) {
      return htmlSafe('margin-top: 30px; height: 150px; overflow-y: scroll;');
    } else {
      return htmlSafe('margin-top: 30px; max-height: 200px; overflow-y: scroll;');
    }
  }),
  actions: {
    word_cloud: function() {
      this.sendAction('word_cloud');
    },
    word_data: function(word) {
      this.sendAction('word_data', word);
    },
  }
});
