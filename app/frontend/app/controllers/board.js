import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import { alias } from '@ember/object/computed';

export default Controller.extend({
  session: service('session'),
  appState: service('app-state'),
  app_state: alias('appState'),
  stashes: service('stashes'),
  /* Parent board shell error UI (invalid id / unsynced). Mirrors
     board/index recovery so board-alt + legacy board aren't Try-Again-only. */
  error_show_home: computed(
    'appState.referenced_user.preferences.home_board.key',
    'appState.currentUser.preferences.home_board.key',
    'stashes.root_board_state.key',
    'stashes.temporary_root_board_state.key',
    function() {
      if(this.get('appState.referenced_user.preferences.home_board.key')) { return true; }
      if(this.get('appState.currentUser.preferences.home_board.key')) { return true; }
      if(this.get('stashes.temporary_root_board_state.key')) { return true; }
      return !!this.get('stashes.root_board_state.key');
    }
  ),
  error_show_back: computed('appState.empty_board_history', function() {
    return !this.get('appState.empty_board_history');
  }),
  error_show_exit_speak: computed(
    'appState.speak_mode',
    'appState.currentUser.supporter_role',
    'appState.modeling',
    function() {
      if(!this.get('appState.speak_mode')) { return false; }
      return !!(this.get('appState.currentUser.supporter_role') || this.get('appState.modeling'));
    }
  ),
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
    error_go_home: function() {
      this.get('appState').jump_to_root_board({index_as_fallback: true});
    },
    error_go_back: function() {
      this.get('appState').back_one_board();
    },
    error_exit_speak_mode: function() {
      var appState = this.get('appState');
      var ready = appState.open_speak_mode_exit_pin('none');
      ready.then(function(res) {
        if(!res || !res.correct_pin) { return; }
        appState.toggle_speak_mode('off');
      }, function() { });
    },
  }
});
