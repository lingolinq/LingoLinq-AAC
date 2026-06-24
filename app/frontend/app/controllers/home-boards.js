import { later as runLater } from '@ember/runloop';
import modal from '../utils/modal';
import i18n from '../utils/i18n';
import Controller from '@ember/controller';
import app_state from '../utils/app_state';

export default Controller.extend({
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
  },

  actions: {
    show_advanced: function() {
      this.set('advanced', true);
    },
    select_board: function() {
      app_state.return_to_index();
      runLater(function() {
        modal.success(i18n.t('board_layout_copying', "Great, sounds like a match! %app_name% is making your own personal copy based on your choices. You can start using it by entering Speak Mode when you're ready."), true, true);
      }, 100);
    }
  }
});
