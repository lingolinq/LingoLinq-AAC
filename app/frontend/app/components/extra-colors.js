import Component from '@ember/component';
import { later as runLater } from '@ember/runloop';
import $ from 'jquery';
import frame_listener from '../utils/frame_listener';
import i18n from '../utils/i18n';

import { htmlSafe } from '@ember/template';
import EmberObject from  '@ember/object';
import { computed } from '@ember/object';
import Button from '../utils/button';
import modal from '../utils/modal';

export default Component.extend({
  didInsertElement: function() {
  },
  computed_colors: computed('colors', function() {
    var res = [];
    (this.get('colors') || []).forEach(function(row) {
      var obj = EmberObject.create(row);
      obj.set('style', htmlSafe("border-color: " + Button.clean_text(row.border || '#888') + "; background: " + Button.clean_text(row.fill || '#fff') + ";"));
      res.push(obj);
    });
    return res;
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
    modify: function() {
      var _this = this;
      this.set('colors', this.get('colors') || []);
      modal.open('modals/extra-colors', {colors: this.get('colors')}).then(function(res) {
        if(res && res.colors) {
          _this.set('colors', res.colors);
        }
      });
    }
  }
});


