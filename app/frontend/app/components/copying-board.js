import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { getOwner } from '@ember/application';
import RSVP from 'rsvp';
import modal from '../utils/modal';
import editManager from '../utils/edit_manager';
import i18n from '../utils/i18n';
import loadHierarchyForCopyModal from '../utils/copy_hierarchy_loader';

/**
 * Copying Board progress modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  router: service('router'),
  tagName: '',

  // Collapsed by default — the board picker is an opt-in disclosure (all boards
  // are already selected). Explicit so aria-expanded reads "false" from the start.
  show_board_picker: false,

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
    this.ctrlActionNoBubble = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function(event) {
        if (event && event.stopPropagation) { event.stopPropagation(); }
        if (event && event.preventDefault) { event.preventDefault(); }
        self.send.apply(self, [actionName].concat(bound));
      };
    };

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
      loadHierarchyForCopyModal(board, {
        skipBoardReloadForCopyModal: true,
        expand_all: true,
        early_live_links_delay_ms: this.get('earlyLiveLinksDelayMs')
      }).then(function(result) {
        if (_this.get('isDestroyed') || _this.get('isDestroying')) { return; }
        _this.set('loading', false);
        const hierarchy = result.hierarchy;
        if (hierarchy && hierarchy.get('root')) {
          if (result.source === 'live_links') {
            _this.set('hierarchyRootOnlyWarning', true);
          } else {
            const rootChildren = hierarchy.get('root.children') || [];
            const expectedLinkedBoards =
              (board.get('linked_boards.length') || 0) > 0 ||
              (board.get('downstream_boards') || 0) > 0 ||
              (board.get('downstream_board_ids.length') || 0) > 0;
            _this.set('hierarchyRootOnlyWarning', expectedLinkedBoards && rootChildren.length === 0);
          }
          _this.set('hierarchy', hierarchy);
        } else {
          _this.start_copying();
        }
      }, function(err) {
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
    board.set('expand_selected_board_ids_to_copy', !include_missing && this.get('hierarchy.live_links_incomplete'));
    const _this = this;
    const model = this.get('model') || {};
    const modalSvc = this.get('modal');
    const appState = this.get('appState');
    board.set('default_locale', null);
    if (model.default_locale && board.get('locale') !== model.default_locale) {
      board.set('default_locale', model.default_locale);
    }
    console.debug('[copying-board] starting copy_board', model.action);
    editManager.copy_board(board, model.action, model.user, model.make_public, model.symbol_library, model.new_owner, model.disconnect).then(function(copiedBoard) {
      console.debug('[copying-board] copy_board resolved', copiedBoard && copiedBoard.get && copiedBoard.get('id'));
      let next = RSVP.resolve();
      const new_board_ids = board_ids_to_include ? copiedBoard.get('new_board_ids') : null;
      if (model.shares && model.shares.length > 0) {
        model.shares.forEach(function(share) {
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
        if (model.translate_locale) {
          return board.load_button_set(true).then(function() {
            const translate_opts = {
              board: board,
              copy: copiedBoard,
              button_set: board.get('button_set'),
              locale: model.translate_locale,
              source_locale: board.get('translations.default') || board.get('locale'),
              default_language: true,
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
        // For an edit-oriented copy, AWAIT the reload so the copy's freshly-granted
        // permissions.edit is loaded BEFORE we transition into the edit route (and
        // before the caller's finish_copy runs) — otherwise the edit-permission check
        // (board-detail.js#5222) sees a stale copy and re-prompts "Edit a Copy" on the
        // brand-new copy. Copying requires an online connection (guarded upstream), so
        // this reload resolves rather than hanging. Non-editing copies keep the original
        // fire-and-forget reload — there a stalled reload must not block the modal close.
        if (model.for_editing) {
          return copiedBoard.reload(true).then(function() { return null; }, function() { return null; });
        }
        copiedBoard.reload(true).then(null, function() {});
        return RSVP.resolve(null);
      });
      next.then(function(res) {
        const translatedResult = !!(res && res.translated === true);
        const copyingOpen =
          modal.is_open('copying-board') ||
          (modalSvc && typeof modalSvc.isOpen === 'function' && modalSvc.isOpen('copying-board'));
        if (copyingOpen || translatedResult) {
          copiedBoard.set('should_reload', true);
          var copyKey = copiedBoard.get('key') || '';
          var editParts = copyKey.split('/');
          if (model.for_editing) {
            // Edit-oriented copy (copy-to-edit, incl. a board previewed via the edit-mode
            // Board Collections drawer): land in EDIT mode of the new copy — NOT the
            // default speak-mode jump (jump_to_board / transitionToBoardForCurrentUiStyle
            // only ever route to speak). The caller's copy_finished callback already
            // performs the transition into the copy's edit route AFTER this modal closes;
            // doing our own transition too caused a double-transition that re-triggered the
            // edit-permission check ("Edit a Copy" again). So: defer to copy_finished when
            // present, and only transition ourselves as a fallback. Either way close the
            // collection drawer if it was the origin (no-op otherwise).
            try {
              var bdCtrl = getOwner(_this).lookup('controller:user/board-detail');
              if (bdCtrl) {
                bdCtrl.set('edit_board_collection_open', false);
                bdCtrl.set('edit_collection_original_board', null);
              }
            } catch (e) { /* controller not resolvable — non-fatal */ }
            if (!model.copy_finished && editParts.length >= 2) {
              _this.get('router').transitionTo('user.board-detail.edit', editParts[0], editParts.slice(1).join('/'));
            }
          } else {
            appState.jump_to_board({
              id: copiedBoard.get('id'),
              key: copyKey
            });
          }
          modal.close({ copied: true, id: copiedBoard.get('id'), key: copiedBoard.get('key') });
          if (modalSvc && typeof modalSvc.isOpen === 'function' && modalSvc.isOpen('copying-board')) {
            modalSvc.close({ copied: true, id: copiedBoard.get('id'), key: copiedBoard.get('key') });
          }
        } else {
          if (model.copy_finished) {
            model.copy_finished(copiedBoard);
          } else {
            modal.notice(i18n.t('copy_created', 'Copy created! You can find the new board in your profile.'));
          }
        }
      }, function(err) {
        const copyingOpen =
          modal.is_open('copying-board') ||
          (modalSvc && typeof modalSvc.isOpen === 'function' && modalSvc.isOpen('copying-board'));
        if (copyingOpen && !_this.get('isDestroyed') && !_this.get('isDestroying')) {
          _this.set('error', err);
        } else {
          modal.error(err);
        }
      });
    }, function(err) {
      console.debug('[copying-board] copy_board rejected', err);
      const copyingOpen =
        modal.is_open('copying-board') ||
        (modalSvc && typeof modalSvc.isOpen === 'function' && modalSvc.isOpen('copying-board'));
      if (copyingOpen && !_this.get('isDestroyed') && !_this.get('isDestroying')) {
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
    },
    // The board picker is collapsed by default — every board is already selected,
    // so opening it is an opt-in step for deselecting specific sub-boards.
    toggle_board_picker() {
      // Collapse a duplicate toggle from one modal click (same fix as bound-select.js).
      var now = (window.performance && performance.now) ? performance.now() : Date.now();
      if (this._lastToggleAt != null && (now - this._lastToggleAt) < 250) { return; }
      this._lastToggleAt = now;
      this.toggleProperty('show_board_picker');
    }
  },

  didInsertElement() {
  this._super(...arguments);
  var self = this;
    this.onClose = function() { self.send('close'); };
    this.onOpening = function() { self.send('opening'); };
    this.onClosing = function() { self.send('closing'); };
},

});
