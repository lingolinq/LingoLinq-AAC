import modal from '../utils/modal';
import { inject as service } from '@ember/service';
import { observer } from '@ember/object';

export default modal.ModalController.extend({
  appState: service('app-state'),
  
  pin: "",
  compare_pin: observer('pin', function() {
    var pin = this.get('pin');
    if(pin == this.get('model.actual_pin')) {
      this.set('pin', '');
      modal.close({correct_pin: true});
      if(this.get('model.action') == 'none') { return; }
      if(this.get('model.action') == 'edit') {
        this.appState.toggle_edit_mode();
      } else {
        this.appState.toggle_speak_mode('off');
      }
    } else if(pin && pin.length >= 4) {
      // error message
      this.set('invalid_pin', true);
      this.set('pin', '');
    }
  }),
  opening: function() {
    this.set('pin', '');
    this.set('invalid_pin', null);
  },
  update_pin: observer('pin_dots', function() {
    var str = this.get('pin_dots') || "";
    var pin = this.get('pin');
    for(var idx = 0; idx < str.length; idx++) {
      if(str[idx] != "●") {
        pin = pin + str[idx];
      }
    }
    if(pin != this.get('pin')) {
      this.set('pin', pin);
    }
  }),
  update_pin_dots: observer('pin', function() {
    var str = "●";
    var res = "";
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
      var pin = this.get('pin') || "";
      pin = pin + digit.toString();
      this.set('pin', pin);
    },
    reveal_pin: function() {
      this.set('show_pin', true);
    }
  }
});
