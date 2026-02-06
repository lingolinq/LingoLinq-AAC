import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { observer } from '@ember/object';
import { computed } from '@ember/object';
import { later as runLater } from '@ember/runloop';
import modal from '../utils/modal';
import i18n from '../utils/i18n';
import LingoLinq from '../app';

/**
 * Add to Sidebar modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  persistence: service('persistence'),
  stashes: service('stashes'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'add-to-sidebar';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  didInsertElement() {
    this._super(...arguments);
    const appState = this.get('appState');
    this.set('has_supervisees', appState.get('sessionUser.supervisees.length') > 0 || appState.get('sessionUser.managed_orgs.length') > 0);
    this.set('loading', false);
    this.set('error', false);
    this.set('model.level', this.get('stashes').get('board_level'));
    this.set('currently_selected_id', null);
    if (!this.get('has_supervisees')) {
      this.set('currently_selected_id', 'self');
    }
  },

  board_levels: computed(function() {
    return LingoLinq.board_levels;
  }),

  user_board: observer('currently_selected_id', 'model.known_supervisees', function() {
    const for_user_id = this.get('currently_selected_id');
    this.set('self_currently_selected', for_user_id === 'self');
    const supervisees = this.get('model.known_supervisees');
    if (supervisees) {
      supervisees.forEach(function(sup) {
        sup.set('currently_selected', for_user_id === sup.id);
      });
    }
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    updateBoardImage(url) {
      if (this.get('model.board')) {
        this.set('model.board.image', url);
      }
    },
    updateLevel(id) {
      this.set('model.level', id);
    },
    updateCurrentlySelectedId(id) {
      this.set('currently_selected_id', id);
    },
    add() {
      const board = this.get('model.board');
      const user_id = this.get('currently_selected_id');
      const _this = this;

      _this.set('loading', true);

      const find_user = LingoLinq.store.findRecord('user', user_id);

      const update_user = find_user.then(function(user) {
        let boards = user.get('preferences.sidebar_boards');
        if (!boards || boards.length === 0) {
          boards = (window.user_preferences && window.user_preferences.any_user && window.user_preferences.any_user.default_sidebar_boards) || [];
        }
        let level = parseInt(_this.get('model.level'), 10);
        if (!level || level < 1 || level > 10) { level = null; }
        boards.unshift({
          name: board.name,
          key: board.key,
          level: level,
          locale: _this.get('appState').get('label_locale'),
          home_lock: !!board.home_lock,
          image: board.image
        });

        user.set('preferences.sidebar_boards', boards);
        return user.save();
      });

      update_user.then(function() {
        _this.set('loading', false);
        if (_this.get('persistence').get('online')) {
          runLater(function() {
            if (_this.get('persistence').get('auto_sync')) {
              _this.get('persistence').sync('self', null, null, 'sidebar_update').then(null, function() {});
            }
          }, 1000);
        }
        _this.get('modal').close('add-to-sidebar');
        _this.get('modal').success(i18n.t('added_to_sidebar', "Added to the user's sidebar!"));
      }, function() {
        _this.set('loading', false);
        _this.set('error', true);
      });
    }
  }
});
