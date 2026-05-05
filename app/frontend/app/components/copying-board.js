import Component from '@ember/component';
import { inject as service } from '@ember/service';
import RSVP from 'rsvp';
import modal from '../utils/modal';
import editManager from '../utils/edit_manager';
import BoardHierarchy from '../utils/board_hierarchy';
import i18n from '../utils/i18n';

/**
 * Copying Board progress modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'copying-board';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
    this.runOpening();
  },

  runOpening() {
    const _this = this;
    _this.set('loading', true);
    _this.set('error', null);
    _this.set('hierarchyLoadFailed', false);
    _this.set('hierarchyRootOnlyWarning', false);
    _this.set('isTimeoutError', false);
    const board = _this.get('model.board');
    if (!board) {
      _this.set('loading', false);
      _this.set('error', i18n.t('copy_board_missing_board', "Board is not available for copying"));
      return;
    }
    if (this.get('model.action') === 'keep_links' || this.get('model.action') === 'remove_links') {
      _this.start_copying();
    } else {
      BoardHierarchy.load_with_button_set(board, { skipBoardReloadForCopyModal: true, expand_all: true }).then(function(hierarchy) {
        console.debug('[copying-board] hierarchy load resolved', hierarchy && hierarchy.get && hierarchy.get('root'));
        if (_this.get('isDestroyed') || _this.get('isDestroying')) { return; }
        _this.set('loading', false);
        if (hierarchy && hierarchy.get('root')) {
          const rootChildren = hierarchy.get('root.children') || [];
          const expectedLinkedBoards =
            (board.get('linked_boards.length') || 0) > 0 ||
            (board.get('downstream_boards') || 0) > 0 ||
            (board.get('downstream_board_ids.length') || 0) > 0;
          _this.set('hierarchyRootOnlyWarning', expectedLinkedBoards && rootChildren.length === 0);
          _this.set('hierarchy', hierarchy);
        } else {
          _this.start_copying();
        }
      }, function(err) {
        console.debug('[copying-board] hierarchy load rejected', err);
        if (_this.get('isDestroyed') || _this.get('isDestroying')) { return; }
        _this.set('loading', false);
        _this.set('error', err);
        _this.set('hierarchyLoadFailed', true);
        if (err && (err.error === 'buttonset load timed out' || err.error === 'generation_stalled')) {
          _this.set('isTimeoutError', true);
        }
      });
    }
  },

  start_copying() {
    const board = this.get('model.board');
    if (!board) {
      this.set('loading', false);
      this.set('error', i18n.t('copy_board_missing_board', "Board is not available for copying"));
      return;
    }
    // keep_links/remove_links skip hierarchy load — still clear loading so the modal
    // shows the in-progress copy message instead of staying on "Loading...".
    this.set('loading', false);
    let board_ids_to_include = null;
    const include_missing = this.get('includeMissing') || this.get('hierarchy.include_missing');
    if (include_missing) {
      board_ids_to_include = null;
      this.set('hierarchy', null);
    } else if (this.get('hierarchy') && this.get('hierarchy').selected_board_ids) {
      board_ids_to_include = this.get('hierarchy').selected_board_ids();
      this.set('hierarchy', null);
    }
    board.set('downstream_board_ids_to_copy', board_ids_to_include);
    const _this = this;
    board.set('default_locale', null);
    if (this.get('model.default_locale') && board.get('locale') !== this.get('model.default_locale')) {
      board.set('default_locale', this.get('model.default_locale'));
    }
    console.debug('[copying-board] starting copy_board', _this.get('model.action'));
    editManager.copy_board(board, _this.get('model.action'), _this.get('model.user'), _this.get('model.make_public'), _this.get('model.symbol_library'), _this.get('model.new_owner'), _this.get('model.disconnect')).then(function(copiedBoard) {
      console.debug('[copying-board] copy_board resolved', copiedBoard && copiedBoard.get && copiedBoard.get('id'));
      if (_this.get('isDestroyed') || _this.get('isDestroying')) { return; }
      let next = RSVP.resolve();
      const new_board_ids = board_ids_to_include ? copiedBoard.get('new_board_ids') : null;
      if (_this.get('model.shares') && _this.get('model.shares').length > 0) {
        _this.get('model.shares').forEach(function(share) {
          next = next.then(function() {
            const user_name = share.user_name;
            copiedBoard.set('sharing_key', 'add_deep-' + user_name);
            return copiedBoard.save();
          });
        });
        next = next.then(null, function() {
          return RSVP.reject(i18n.t('sharing_failed', 'Sharing with one or more users failed'));
        });
      }
      next = next.then(function() {
        if (_this.get('model.translate_locale')) {
          return board.load_button_set(true).then(function() {
            const translate_opts = {
              board: board,
              copy: copiedBoard,
              button_set: board.get('button_set'),
              locale: _this.get('model.translate_locale'),
              old_board_ids_to_translate: board_ids_to_include,
              new_board_ids_to_translate: new_board_ids
            };
            return modal.open('button-set', translate_opts).then(function(res) {
              if (res && res.translated) {
                return board.reload(true).then(function() {
                  return RSVP.resolve({ translated: true });
                });
              }
              return RSVP.reject(i18n.t('translation_canceled', 'Translation was canceled'));
            });
          });
        }
        // Do not block closing the copying modal on reload — a stuck reload() left the UI
        // on "Loading..." / copying forever even after button-set progress finished.
        copiedBoard.reload(true).then(null, function() {});
        return RSVP.resolve(null);
      });
      next.then(function(res) {
        if (_this.get('isDestroyed') || _this.get('isDestroying')) { return; }
        const modalSvc = _this.get('modal');
        const translatedResult = !!(res && res.translated === true);
        const copyingOpen =
          modal.is_open('copying-board') ||
          (modalSvc && typeof modalSvc.isOpen === 'function' && modalSvc.isOpen('copying-board'));
        if (copyingOpen || translatedResult) {
          copiedBoard.set('should_reload', true);
          _this.get('appState').jump_to_board({
            id: copiedBoard.get('id'),
            key: copiedBoard.get('key')
          });
          modal.close({ copied: true, id: copiedBoard.get('id'), key: copiedBoard.get('key') });
          if (modalSvc && typeof modalSvc.isOpen === 'function' && modalSvc.isOpen('copying-board')) {
            modalSvc.close({ copied: true, id: copiedBoard.get('id'), key: copiedBoard.get('key') });
          }
        } else {
          modal.notice(i18n.t('copy_created', 'Copy created! You can find the new board in your profile.'));
        }
      }, function(err) {
        if (_this.get('isDestroyed') || _this.get('isDestroying')) { return; }
        const modalSvc = _this.get('modal');
        const copyingOpen =
          modal.is_open('copying-board') ||
          (modalSvc && typeof modalSvc.isOpen === 'function' && modalSvc.isOpen('copying-board'));
        if (copyingOpen) {
          _this.set('error', err);
        } else {
          modal.error(err);
        }
      });
    }, function(err) {
      console.debug('[copying-board] copy_board rejected', err);
      if (_this.get('isDestroyed') || _this.get('isDestroying')) { return; }
      const modalSvc = _this.get('modal');
      const copyingOpen =
        modal.is_open('copying-board') ||
        (modalSvc && typeof modalSvc.isOpen === 'function' && modalSvc.isOpen('copying-board'));
      if (copyingOpen) {
        _this.set('error', err);
      } else {
        modal.error(err);
      }
    });
  },

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    confirm_hierarchy() {
      this.start_copying();
    },
    start_copying() {
      this.start_copying();
    },
    copy_all() {
      this.set('includeMissing', true);
      this.start_copying();
    }
  }
});
