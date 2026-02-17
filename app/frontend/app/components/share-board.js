import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import modal from '../utils/modal';
import i18n from '../utils/i18n';

/**
 * Share Board modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'share-board';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    const board = (options && options.board) || this.get('board');
    this.set('model', options);
    this.set('board', board);
    this.set('confirm_public_board', false);
    this.set('show_embed', false);
    this.set('error_confirming_public_board', false);
  },

  supervisee_share: computed('share_user_name', 'appState.currentUser.known_supervisees', function() {
    const un = this.get('share_user_name');
    return un && (this.get('appState').get('currentUser.known_supervisees') || []).find(function(s) { return s.user_name === un; });
  }),

  not_copyable: computed('share_user_name', 'appState.currentUser.known_supervisees', function() {
    const un = this.get('share_user_name');
    return !(un && (this.get('appState').get('currentUser.known_supervisees') || []).find(function(s) { return s.user_name === un && s.edit_permission; }));
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    share_with_user() {
      const user_name = this.get('share_user_name');
      const include_downstream = this.get('share_include_downstream');
      const allow_editing = this.get('share_allow_editing');
      let sharing_key = 'add_shallow-' + user_name;
      if (allow_editing) {
        sharing_key = 'add_edit_shallow-' + user_name;
        if (include_downstream) { sharing_key = 'add_edit_deep-' + user_name; }
      } else {
        if (include_downstream) { sharing_key = 'add_deep-' + user_name; }
      }
      const board = this.get('board');
      board.set('sharing_key', sharing_key);
      board.save().then(function() {}, function() {
        modal.error(i18n.t('board_sharing_failed', 'Board sharing action failed'));
      });
    },
    unshare(id) {
      const board = this.get('board');
      board.set('sharing_key', 'remove-' + id);
      board.save().then(function() {}, function() {
        modal.error(i18n.t('unsharing_failed', 'Board unsharing action failed'));
      });
    },
    make_public(action) {
      if (action === 'confirm') {
        const board = this.get('board');
        board.set('visibility', 'public');
        board.set('public', true);
        const _this = this;
        const needs_refresh = board.get('update_visibility_downstream');
        board.save().then(function() {
          board.set('update_visibility_downstream', false);
          if (needs_refresh) {
            _this.get('appState').set('board_reload_key', Math.random() + '-' + (new Date()).getTime());
          }
          _this.set('confirm_public_board', false);
        }, function() {
          _this.set('confirm_public_board', false);
          _this.set('error_confirming_public_board', true);
          board.set('public', false);
        });
      } else if (action === 'cancel') {
        this.set('confirm_public_board', false);
      } else {
        this.set('board.update_visibility_downstream', true);
        this.set('confirm_public_board', true);
      }
    },
    copy_event(res) {
      if (res) {
        this.set('copy_result', { succeeded: true });
      } else {
        this.set('copy_result', { failed: true });
      }
    },
    copy_board() {
      const controller = this.get('appState.controller');
      if (controller && controller.copy_board) {
        controller.copy_board(null, null, this.get('share_user_name'));
      }
    },
    set_share_user_name(user_name) {
      this.set('share_user_name', user_name);
    },
    show_embed_board() {
      this.set('show_embed', !this.get('show_embed'));
    }
  }
});
