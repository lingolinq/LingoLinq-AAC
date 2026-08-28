import Component from '@ember/component';
import { inject as service } from '@ember/service';

export default Component.extend({
  modal: service('modal'),
  tagName: '',

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

    var modalService = this.get('modal');
    var template = 'confirm-reset-categories';
    var options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                  (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                  this.get('model') || {};
    this.set('model', options);
  },

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    confirm() {
      this.get('modal').close('reset');
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
