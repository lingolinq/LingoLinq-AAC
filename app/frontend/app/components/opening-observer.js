import Component from '@ember/component';
import { later as runLater } from '@ember/runloop';

export default Component.extend({
  didInsertElement: function() {
    this._super(...arguments);
    var _this = this;
    if(!this.get('already_opened')) {
      // Use runLater to avoid setting attributes during render
      runLater(function() {
        _this.set('already_opened', true);
        if(_this.opening) {
          _this.opening();
        }
      });
    }
    if(!this.get('already_done_opening')) {
      runLater(function() {
        _this.set('already_done_opening', true);
        if(_this.done_opening) {
          _this.done_opening();
        }
      });
    }
  },
  willDestroy: function() {
    this._super(...arguments);
    if(!this.get('already_closed')) {
      this.set('already_closed', true);
      if(this.closing) {
        this.closing();
      }
    }
  }
});



