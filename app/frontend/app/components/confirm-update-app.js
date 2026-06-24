import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';

/**
 * Confirm app update modal (Phase 2).
 * Converted from confirm-update-app controller/template.
 */
export default Component.extend({
  modal: service('modal'),
  tagName: '',

  version: computed(function() {
    return (window.LingoLinq && window.LingoLinq.update_version) || 'unknown';
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
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    restart() {
      if (window.LingoLinq && window.LingoLinq.install_update) {
        window.LingoLinq.install_update();
      } else {
        this.set('error', true);
      }
    }
  },

  didInsertElement() {
  this._super(...arguments);
  var self = this;
    this.onClose = function() { self.send('close'); };
    this.onOpening = function() { self.send('opening'); };
    this.onClosing = function() { self.send('closing'); };
},

});
