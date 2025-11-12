import { later as runLater } from '@ember/runloop';
import modal from '../utils/modal';
import app_state from '../utils/app_state';
import i18n from '../utils/i18n';
import persistence from '../utils/persistence';
import stashes from '../utils/_stashes';
import LingoLinq from '../app';
import { observer } from '@ember/object';
import { computed } from '@ember/object';

export default modal.ModalController.extend({
  opening: function() {
    var supervisees = [];
    this.set('has_supervisees', app_state.get('sessionUser.supervisees.length') > 0 || app_state.get('sessionUser.managed_orgs.length') > 0);
    this.set('loading', false);
    this.set('error', false);
    this.set('app_state', app_state);
    this.set('model.level', stashes.get('board_level'));
    this.set('currently_selected_id', null);
    if(supervisees.length === 0) {
      this.set('currently_selected_id', 'self');
    }
  },
  board_levels: computed(function() {
    return LingoLinq.board_levels;
  }),
  user_board: observer('currently_selected_id', 'model.known_supervisees', function() {
    var for_user_id = this.get('currently_selected_id');
    this.set('self_currently_selected', for_user_id == 'self');
    if(this.get('model.known_supervisees')) {
      this.get('model.known_supervisees').forEach(function(sup) {
        if(for_user_id == sup.id) {
          sup.set('currently_selected', true);
        } else {
          sup.set('currently_selected', false);
        }
      });
    }
  }),
  actions: {
    add: function() {
      var board = this.get('model.board');
      var user_id = this.get('currently_selected_id');
      var _this = this;

      _this.set('loading', true);

      var find_user = LingoLinq.store.findRecord('user', user_id);

      var update_user = find_user.then(function(user) {
        var boards = user.get('preferences.sidebar_boards');
        if(!boards || boards.length === 0) {
          boards = window.user_preferences.any_user.default_sidebar_boards;
        }
        var level = parseInt(_this.get('model.level'), 10);
        if(!level || level < 1 || level > 10) { level = null; }
        boards.unshift({
          name: board.name,
          key: board.key,
          level: level,
          locale: app_state.get('label_locale'),
          home_lock: !!board.home_lock,
          image: board.image
        });

        user.set('preferences.sidebar_boards', boards);
        return user.save();
      });

      update_user.then(function(user) {
        _this.set('loading', false);
        if(persistence.get('online')) {
          runLater(function() {
            if(persistence.get('auto_sync')) {
              console.debug('syncing because sidebar updated');
              persistence.sync('self', null, null, 'sidebar_update').then(null, function() { });  
            }
          }, 1000);
        }
        modal.close('add-to-sidebar');
        modal.success(i18n.t('added_to_sidebar', "Added to the user's sidebar!"));
      }, function() {
        _this.set('loading', false);
        _this.set('error', true);
      });
    }
  }
});
