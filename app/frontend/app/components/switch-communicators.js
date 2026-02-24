import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { observer } from '@ember/object';
import { computed } from '@ember/object';
import modal from '../utils/modal';
import i18n from '../utils/i18n';

/**
 * Switch Communicators modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  store: service('store'),
  router: service('router'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'switch-communicators';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  didInsertElement() {
    this._super(...arguments);
    this.set('model.jump_home', this.get('model.stay') !== true);
    this.set('model.keep_as_self', this.get('model.modeling') || this.get('appState').get('referenced_speak_mode_user') != null);
    if (this.get('model.modeling') === 'ask') {
      this.set('model.keep_as_self', true);
    }
    this.set('has_supervisees', this.get('appState').get('sessionUser.supervisees.length') > 0 || this.get('appState').get('sessionUser.managed_orgs.length') > 0);
    this.set('currently_selected_id', null);
  },

  self_currently_selected: computed('appState.currentUser.id', 'appState.sessionUser.id', function() {
    return this.get('appState').get('currentUser.id') && this.get('appState').get('currentUser.id') === this.get('appState').get('sessionUser.id');
  }),

  select_on_change: observer('currently_selected_id', function() {
    if (this.get('currently_selected_id')) {
      this.send('select', this.get('currently_selected_id'));
    }
  }),

  modeling_choice: computed('model.modeling', function() {
    return this.get('model.modeling') !== undefined && this.get('model.modeling') !== 'ask';
  }),

  allow_all: computed('model.setup', function() {
    return !this.get('model.setup');
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    updateCurrentlySelectedId(id) {
      this.set('currently_selected_id', id);
    },
    select(board_for_user_id) {
      const jump_home = this.get('model.jump_home');
      const keep_as_self = this.get('model.keep_as_self');
      const appState = this.get('appState');
      this.get('modal').close();
      if (this.get('model.route')) {
        const _this = this;
        const routeName = this.get('model.route');
        // index has no dynamic segments - passing user_name would cause "More context objects" error
        const routeNeedsModel = routeName !== 'index';
        this.get('store').findRecord('user', board_for_user_id).then(function(u) {
          if (routeNeedsModel) {
            _this.get('router').transitionTo(routeName, u.get('user_name'));
          } else {
            _this.get('router').transitionTo(routeName);
          }
        }, function() {
          modal.close();
          modal.error(i18n.t('error_loading_user_details', "There was an unexpected error loading the user's details"));
        });
      } else if (this.get('model.modal')) {
        const _this = this;
        this.get('store').findRecord('user', board_for_user_id).then(function(u) {
          modal.open(_this.get('model.modal.modal'), { user: u });
        }, function() {
          modal.close();
          modal.error(i18n.t('error_loading_user_details', "There was an unexpected error loading the user's details"));
        });
      } else if (this.get('model.eval')) {
        appState.set_speak_mode_user(board_for_user_id, false, false, 'obf/eval');
      } else if (this.get('model.setup')) {
        const params = { page: null, user_id: null };
        if (board_for_user_id !== 'self') {
          params.user_id = board_for_user_id;
        }
        this.get('router').transitionTo('setup', { queryParams: params });
      } else {
        appState.set_speak_mode_user(board_for_user_id, jump_home, keep_as_self);
      }
    },
    set_attribute(attr, val) {
      this.set('model.' + attr, val);
    }
  }
});
