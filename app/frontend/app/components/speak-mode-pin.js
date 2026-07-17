import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { observer, computed } from '@ember/object';
import modal from '../utils/modal';

/**
 * Speak Mode PIN modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
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
    const modalService = this.get('modal');
    const template = 'speak-mode-pin';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
    this.set('pin', '');
    this.set('pin_dots', '');
    this.set('show_typed_digits', false);
    this.set('invalid_pin', false);
  },

  // The PIN to validate/reveal is the current user's stored speak_mode_pin, read
  // live from app-state — it is NOT passed through the modal options (which would
  // place the plaintext PIN in the modal service's in-memory settings blob).
  actual_pin: computed('appState.currentUser.preferences.speak_mode_pin', function() {
    return (this.get('appState.currentUser.preferences.speak_mode_pin') || '').toString();
  }),

  update_pin: observer('pin_dots', function() {
    const str = this.get('pin_dots') || '';
    let pin = this.get('pin');
    for (let idx = 0; idx < str.length; idx++) {
      if (str[idx] !== '●') {
        pin = pin + str[idx];
      }
    }
    if (pin !== this.get('pin')) {
      this.set('pin', pin);
    }
  }),

  update_pin_dots: observer('pin', function() {
    const str = '●';
    let res = '';
    const steps = (this.get('pin') || '').length;
    for (let idx = 0; idx < steps; idx++) {
      res = res + str;
    }
    if (res !== this.get('pin_dots')) {
      this.set('pin_dots', res);
    }
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      this.set('pin', '');
      this.set('pin_dots', '');
      this.set('show_typed_digits', false);
      this.set('invalid_pin', false);
    },
    closing() {},
    add_digit(digit) {
      let pin = this.get('pin') || '';
      pin = pin + digit.toString();
      this.set('pin', pin);
      this.set('invalid_pin', false);
    },
    reveal_pin() {
      this.set('show_pin', true);
    },
    toggle_typed_digits() {
      this.toggleProperty('show_typed_digits');
    },
    delete_digit() {
      let pin = this.get('pin') || '';
      pin = pin.slice(0, -1);
      this.set('pin', pin);
      this.set('invalid_pin', false);
    },
    submit_pin() {
      const pin = String(this.get('pin') || '');
      const actual = this.get('actual_pin');
      if (pin === actual) {
        this.set('invalid_pin', false);
        this.set('pin', '');
        this.set('pin_dots', '');
        modal.close({ correct_pin: true });
        if (this.get('model.action') === 'none') { return; }
        if (this.get('model.action') === 'edit') {
          this.get('appState').toggle_edit_mode();
        } else {
          this.get('appState').toggle_speak_mode('off');
        }
      } else {
        this.set('pin', '');
        this.set('pin_dots', '');
        this.set('invalid_pin', true);
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
