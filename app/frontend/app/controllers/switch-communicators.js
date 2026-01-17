import modal from '../utils/modal';
import app_state from '../utils/app_state';
import i18n from '../utils/i18n';
import { observer } from '@ember/object';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

export default modal.ModalController.extend({
  appState: service('app-state'),
  modal: service(),

  opening: function() {
    this.set('model.jump_home', this.get('model.stay') !== true);
    this.set('model.keep_as_self', this.get('model.modeling') || this.appState.get('referenced_speak_mode_user') != null);
    if(this.get('model.modeling') == 'ask') {
      this.set('model.keep_as_self', true);
    }
    this.set('has_supervisees', this.appState.get('sessionUser.supervisees.length') > 0 || this.appState.get('sessionUser.managed_orgs.length') > 0);
    this.set('currently_selected_id', null);
  },
  self_currently_selected: computed('app_state.currentUser.id', function() {
    return this.appState.get('currentUser.id') && this.appState.get('currentUser.id') == this.appState.get('sessionUser.id');
  }),
  select_on_change: observer('currently_selected_id', function() {
    if(this.get('currently_selected_id')) {
      this.send('select', this.get('currently_selected_id'));
    }
  }),
  modeling_choice: computed('model.modeling', function() {
    return this.get('model.modeling') !== undefined && this.get('model.modeling') != 'ask';
  }),
  allow_all: computed('model.setup', function() {
    return !this.get('model.setup');
  }),
  actions: {
    select: function(board_for_user_id) {
      var jump_home = this.get('model.jump_home');
      var keep_as_self = this.get('model.keep_as_self');
      this.modal.close();
      if(this.get('model.route')) {
        var _this = this;
        this.store.findRecord('user', board_for_user_id).then(function(u) {
          _this.transitionToRoute(_this.get('model.route'), u.get('user_name'));
        }, function(err) {
          this.modal.close();
          this.modal.error(i18n.t('error_loading_user_details', "There was an unexpected error loading the user's details"));
        });
      } else if(this.get('model.modal')) {
        var _this = this;
        this.store.findRecord('user', board_for_user_id).then(function(u) {
          this.modal.open(_this.get('modal.modal'), {user: u});
        }, function(err) {
          this.modal.close();
          this.modal.error(i18n.t('error_loading_user_details', "There was an unexpected error loading the user's details"));
        });
      } else if(this.get('model.eval')) {
        app_state.set_speak_mode_user(board_for_user_id, false, false, 'obf/eval');
      } else if(this.get('model.setup')) {
        var params = {page: null, user_id: null};
        if(board_for_user_id != 'self') {
          params.user_id = board_for_user_id;
        }
        this.transitionToRoute('setup', {queryParams: params});
      } else {
        app_state.set_speak_mode_user(board_for_user_id, jump_home, keep_as_self);
      }
    },
    set_attribute(attr, val) {
      this.set('model.' + attr, val);
    }
  }
});
