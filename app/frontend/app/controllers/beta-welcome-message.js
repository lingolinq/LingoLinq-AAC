import Controller from '@ember/controller';
import { computed } from '@ember/object';

export default Controller.extend({
  displayName: '',
  // Used by the Short layout's accept checkbox + Get Started button (the flow
  // moved up to this page in Short mode; in Original mode it lives on
  // beta-welcome). The Original/Short toggle was removed 2026-07-25 — this page
  // now always renders the Short layout.
  agreementAccepted: false,
  acceptButtonDisabled: computed('agreementAccepted', function() {
    return !this.get('agreementAccepted');
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
  }
});
