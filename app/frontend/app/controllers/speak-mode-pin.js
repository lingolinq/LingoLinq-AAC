import modal from '../utils/modal';
import { inject as service } from '@ember/service';
import { observer } from '@ember/object';

export default modal.ModalController.extend({
  appState: service('app-state'),

  pin: '',
  show_typed_digits: false,
  invalid_pin: false,

  opening: function() {
    this.set('pin', '');
    this.set('pin_dots', '');
    this.set('show_typed_digits', false);
    this.set('invalid_pin', false);
  },
  update_pin: observer('pin_dots', function() {
    var str = this.get('pin_dots') || '';
    var pin = this.get('pin');
    for(var idx = 0; idx < str.length; idx++) {
      if(str[idx] != '●') {
        pin = pin + str[idx];
      }
    }
    if(pin != this.get('pin')) {
      this.set('pin', pin);
    }
  }),
  update_pin_dots: observer('pin', function() {
    var str = '●';
    var res = '';
    var steps = (this.get('pin') || '').length;
    for(var idx = 0; idx < steps; idx++) {
      res = res + str;
    }
    if(res != this.get('pin_dots')) {
      this.set('pin_dots', res);
    }
  }),
  actions: {
    add_digit: function(digit) {
      var pin = this.get('pin') || '';
      pin = pin + digit.toString();
      this.set('pin', pin);
      this.set('invalid_pin', false);
    },
    toggle_typed_digits: function() {
      this.toggleProperty('show_typed_digits');
    },
    delete_digit: function() {
      var pin = this.get('pin') || '';
      pin = pin.slice(0, -1);
      this.set('pin', pin);
      this.set('invalid_pin', false);
    },
    submit_pin: function() {
      var pin = String(this.get('pin') || '');
      var actual = String(this.get('model.actual_pin') || '');
      if (pin === actual) {
        this.set('invalid_pin', false);
        this.set('pin', '');
        this.set('pin_dots', '');
        modal.close({correct_pin: true});
        if(this.get('model.action') == 'none') { return; }
        if(this.get('model.action') == 'edit') {
          this.appState.toggle_edit_mode();
        } else {
          this.appState.toggle_speak_mode('off');
        }
      } else {
        this.set('pin', '');
        this.set('pin_dots', '');
        this.set('invalid_pin', true);
      }
    }
  }
});
