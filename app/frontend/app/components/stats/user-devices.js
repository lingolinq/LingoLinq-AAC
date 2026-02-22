import Component from '@ember/component';
import { htmlSafe } from '@ember/template';
import { computed } from '@ember/object';

export default Component.extend({
  elem_class: computed('side_by_side', function() {
    if(this.get('side_by_side')) {
      return htmlSafe('col-sm-6');
    } else {
      return htmlSafe('col-sm-2');
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
      return htmlSafe('padding-top: 24px; height: 200px; overflow: auto;');
    } else {
      return htmlSafe('padding-top: 24px; max-height: 350px; overflow: auto;');
    }
  }),
  actions: {
    filter: function(device) {
      if (this.filter) {
        this.filter('device', device.id);
      }
    }
  }
});
