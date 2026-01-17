import Component from '@ember/component';
import i18n from '../utils/i18n';
import { htmlSafe } from '@ember/string';
import { computed } from '@ember/object';

export default Component.extend({
  didInsertElement: function() {
  },
  badge_container_style: computed('big', function() {
    var res = '';
    if(this.get('big')) {
      res = 'width: 300px; clear: both; margin-left: 5px;';
    } else if(this.get('inline')) {
      res = 'width: 100%; clear: both; opacity: 0.7;';
    } else {
      res = 'width: 310px; clear: both; margin-left: 39px; margin-top: 5px; margin-bottom: -20px;';
    }
    return htmlSafe(res);
  }),
  image_style: computed('big', function() {
    var res = '';
    if(this.get('big')) {
      res = 'height: 50px; width: 50px; float: left; margin-right: 5px; object-fit: contain; object-position: center;';
    } else {
      res = 'height: 40px; width: 40px; margin: -5px 5px -5px -5px; float: left; object-fit: contain; object-position: center;';
    }
    return htmlSafe(res);
  }),
  progress_container_style: computed('big', 'inline', function() {
    var res = '';
    if(this.get('big')) {
      res = 'height: 50px; font-size: 40px; border-radius: 10px; border: 2px solid rgba(0, 0, 0, 0.5);';
    } else if(this.get('inline')) {
      res = 'margin-bottom: 0; height: 30px; font-size: 40px; border-radius: 5px; border: 2px solid rgba(0, 0, 0, 0.4);';
    } else {
      res = 'height: 30px; font-size: 40px; border-radius: 5px; border: 2px solid rgba(0, 0, 0, 0.4);';
    }
    return htmlSafe(res);
  }),
  badge_progress: computed('badge.progress', function() {
    return (this.get('badge.progress') || 0) * 100
  }),
  progress_style: computed('badge_progress', function() {
    return htmlSafe('width: ' + this.get('badge_progress') + '%');
  }),
  actions: {
    badge_popup: function(user_id) {
      this.modal.open('badge-awarded', {badge: {id: this.get('badge.id')}});
    }
  }
});
