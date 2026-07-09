import Controller from '@ember/controller';
import modal from '../../utils/modal';
import LingoLinq from '../../app';
import i18n from '../../utils/i18n';
import app_state from '../../utils/app_state';
import { computed, get as emberGet, set as emberSet } from '@ember/object';
import capabilities from '../../utils/capabilities';

export default Controller.extend({
  analysis_subset: computed('focus.analysis.found', function() {
    return (this.get('focus.analysis.found') || []);
  }),
  analysis_extras: computed('focus.analysis.found', 'refresh_id', function() {
    var list = (this.get('focus.analysis.found') || []);
    return list.filter(function(b) { return b.collapsed; });
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
    toggle: function(btn) {
      emberSet(btn, 'collapsed', !emberGet(btn, 'collapsed'));
      this.set('refresh_id', (new Date()).getTime());
    },
    print: function() {
      capabilities.print();
    }
  }
});
