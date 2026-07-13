import Component from '@ember/component';
import modal from '../utils/modal';
import i18n from '../utils/i18n';
import { htmlSafe } from '@ember/template';
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
  init() {
    this._super(...arguments);
    var self = this;
    this.ctrlAction = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function() {
        var args = bound.concat(Array.prototype.slice.call(arguments));
        var evt = args[args.length - 1];
        if (evt && typeof evt.preventDefault === 'function' && (evt.type || evt.target)) {
          if (evt.preventDefault) { evt.preventDefault(); }
          args.pop();
        }
        self.send.apply(self, [actionName].concat(args));
      };
    };
    this.ctrlActionNoBubble = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function(event) {
        if (event && event.stopPropagation) { event.stopPropagation(); }
        if (event && event.preventDefault) { event.preventDefault(); }
        self.send.apply(self, [actionName].concat(bound));
      };
    };
  },

  actions: {
    badge_popup: function(user_id) {
      modal.open('badge-awarded', {badge: {id: this.get('badge.id')}});
    }
  }
});
