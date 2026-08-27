import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { observer } from '@ember/object';
import { computed } from '@ember/object';
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
    const template = 'switch-communicators';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  didInsertElement() {
    this._super(...arguments);
    var self = this;
    this.onClose = function() { self.send('close'); };
    this.onOpening = function() { self.send('opening'); };
    this.onClosing = function() { self.send('closing'); };
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
        if (!routeName) { return; }
        // Only user.* routes have a :user_id dynamic segment; index, setup, etc. would throw "More context objects" if we pass user_name
        const routeNeedsModel = routeName === 'user' || (typeof routeName === 'string' && routeName.startsWith('user.'));
        this.get('store').findRecord('user', board_for_user_id).then(function(u) {
          if (routeNeedsModel) {
            _this.get('router').transitionTo(routeName, u.get('user_name'));
          } else {
            _this.get('router').transitionTo(routeName);
          }
        }, function() {
          _this.get('modal').close();
          _this.get('modal').error(i18n.t('error_loading_user_details', "There was an unexpected error loading the user's details"));
        });
      } else if (this.get('model.modal')) {
        const _this = this;
        this.get('store').findRecord('user', board_for_user_id).then(function(u) {
          _this.get('modal').open(_this.get('model.modal.modal'), { user: u });
        }, function() {
          _this.get('modal').close();
          _this.get('modal').error(i18n.t('error_loading_user_details', "There was an unexpected error loading the user's details"));
        });
      } else if (this.get('model.eval')) {
        appState.set_speak_mode_user(board_for_user_id, false, false, 'obf/eval');
      // "Set up THAT user" now opens the standalone board picker for the chosen
      // communicator instead of the retired wizard. The picker mirrors setup's
      // user_id / setup_user resolution (controllers/board-picker.js:10), so it is
      // the same screen the wizard's board step used to show for that person.
      // `user_id` stays null for 'self' so a self-selection opens the plain picker
      // rather than a redundant ?user_id round-trip — matching `homeBoardPickerUserId`.
      } else if (this.get('model.setup')) {
        const params = { user_id: null };
        if (board_for_user_id !== 'self') {
          params.user_id = board_for_user_id;
        }
        this.get('router').transitionTo('board-picker', { queryParams: params });
      } else {
        appState.set_speak_mode_user(board_for_user_id, jump_home, keep_as_self);
      }
    },
    set_attribute(attr, val) {
      this.set('model.' + attr, val);
    }
  }
});
