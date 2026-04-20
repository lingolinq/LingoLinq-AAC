import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import modalUtil from '../utils/modal';
import editManager from '../utils/edit_manager';

/**
 * Board Actions Modal Component
 *
 * Converted from modals/board-actions template/controller to component
 * for the new service-based modal system.
 */
export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  router: service('router'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'modals/board-actions';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  cannot_edit: computed('model.board.permissions.edit', function() {
    const board = this.get('model.board');
    return !board || !board.permissions || !board.permissions.edit;
  }),

  cannot_categorize: computed('appState.currentUser', function() {
    return !this.get('appState.currentUser');
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      this.get('modal').setComponent(this);
    },
    closing() {},
    privacy() {
      const model = this.get('model');
      if (!model || !model.board) { return; }
      modalUtil.open('modals/board-privacy', { board: model.board, button_set: model.board.button_set });
    },
    categorize() {
      const model = this.get('model');
      if (!model || !model.board || !this.get('appState')) { return; }
      modalUtil.open('modals/tag-board', { board: model.board, user: this.appState.get('currentUser') });
    },
    langs() {
      const model = this.get('model');
      if (!model || !model.board) { return; }
      modalUtil.open('modals/slice-locales', { board: model.board, button_set: model.board.button_set });
    },
    translate() {
      const model = this.get('model');
      if (!model || !model.board) { return; }
      modalUtil.open('translation-select', { board: model.board, button_set: model.board.button_set });
    },
    swap_images() {
      const model = this.get('model');
      if (!model || !model.board) { return; }
      modalUtil.open('swap-images', { board: model.board, button_set: model.board.button_set });
    },
    download() {
      const _this = this;
      const model = this.get('model');
      if (!model || !model.board || !this.get('appState')) { return; }
      this.appState.assert_source().then(function() {
        if (!_this.get('model') || !_this.get('model.board')) { return; }
        const board = _this.get('model.board');
        const linked = board.get && board.get('linked_boards');
        const has_links = !!(linked && linked.length > 0);
        const board_id = (board.get && (board.get('key') || board.get('id'))) || board.id;
        modalUtil.open('download-board', { type: 'obf', has_links: has_links, id: board_id });
      }, function() {});
    },
    batch_recording() {
      const _this = this;
      const model = this.get('model');
      if (!model || !model.board || !this.get('appState')) { return; }
      modalUtil.open('batch-recording', { user: this.appState.get('currentUser'), board: model.board }).then(function() {
        if (!_this.get('model')) { return; }
        _this.get('model').reload().then(function() {
          if (_this.get('model')) {
            _this.get('model').load_button_set(true);
            editManager.process_for_displaying();
          }
        });
      });
    },
    board_layout() {
      var user = this.get('appState.currentUser');
      if (!user) { return; }
      var user_id = user.get('id');
      var board_key = this.get('model.board.key') || this.get('model.board.id');
      this.get('modal').close();
      this.get('appState').set('board_layout_mode', board_key);
      this.get('router').transitionTo('setup', { queryParams: { page: 'symbols', user_id: user_id, mode: 'layout' } });
    },
    delete() {
      const model = this.get('model');
      if (!model || !model.board) { return; }
      modalUtil.open('confirm-delete-board', { board: model.board, redirect: true });
    }
  }
});
