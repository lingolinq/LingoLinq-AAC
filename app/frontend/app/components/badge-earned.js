import Component from '@ember/component';
import i18n from '../utils/i18n';
import { htmlSafe } from '@ember/string';
import { computed } from '@ember/object';

export default Component.extend({
  didInsertElement: function() {
  },
  badge_container_style: computed('big', 'inline', function() {
    var res = '';
    if(this.get('big')) {
    } else if(this.get('inline')) {
      res = 'text-align: right; opacity: 0.7;';
    } else {
      res = 'margin-top: -10px; margin-bottom: -70px;';
    }
    return htmlSafe(res);
  }),
  image_style: computed('big', function() {
    var res = '';
    if(this.get('big')) {
      res = 'height: 80px; width: 80px;';
    } else {
      res = '';
    }
    return htmlSafe(res);
  }),
  text_style: computed('big', function() {
    var res = '';
    if(this.get('big')) {
      res = 'font-size: 30px; color: #000; vertical-align: middle; text-decoration: none;'
    } else {
      res = 'display: none;'
    }
    return htmlSafe(res);
  }),
  actions: {
    badge_popup: function(user_id) {
      this.modal.open('badge-awarded', {badge: {id: this.get('badge.id')}});
    }
  }
});
