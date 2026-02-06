import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { observer } from '@ember/object';
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
    const modalService = this.get('modal');
    const template = 'speak-mode-pin';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
    this.set('pin', '');
    this.set('invalid_pin', null);
  },

  compare_pin: observer('pin', function() {
    const pin = this.get('pin');
    if (pin === this.get('model.actual_pin')) {
      this.set('pin', '');
      modal.close({ correct_pin: true });
      if (this.get('model.action') === 'none') { return; }
      if (this.get('model.action') === 'edit') {
        this.get('appState').toggle_edit_mode();
      } else {
        this.get('appState').toggle_speak_mode('off');
      }
    } else if (pin && pin.length >= 4) {
      this.set('invalid_pin', true);
      this.set('pin', '');
    }
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
      this.set('invalid_pin', null);
    },
    closing() {},
    add_digit(digit) {
      let pin = this.get('pin') || '';
      pin = pin + digit.toString();
      this.set('pin', pin);
    },
    reveal_pin() {
      this.set('show_pin', true);
    }
  }
});
