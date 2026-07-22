import Component from '@ember/component';
import { computed } from '@ember/object';
import i18n from '../utils/i18n';

// A password input with a show/hide toggle. One-way @value in, @onChange out
// (DDAU, via the set-value helper at the call site) — no two-way binding.
// Kept as a classic tagless component so the visibility toggle stays unit-testable
// (Ember 5 {{on}} doesn't bind classic methods; click routes through ctrlAction).
export default Component.extend({
  tagName: '',
  showPassword: false,
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
    // DDAU write-back: emit the typed value up through @onChange.
    this.emitChange = function(event) {
      if (self.onChange) { self.onChange(event.target.value); }
    };
  },
  inputType: computed('showPassword', function() {
    return this.get('showPassword') ? 'text' : 'password';
  }),
  toggleAriaLabel: computed('showPassword', function() {
    if(this.get('showPassword')) {
      return i18n.t('hide_password', "Hide password");
    }
    return i18n.t('show_password', "Show password");
  }),
  actions: {
    togglePasswordVisibility() {
      this.toggleProperty('showPassword');
    }
  }
});
