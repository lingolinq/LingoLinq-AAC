import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { getOwner } from '@ember/application';
import RSVP from 'rsvp';
import modal from '../utils/modal';
import editManager from '../utils/edit_manager';
import i18n from '../utils/i18n';
import loadHierarchyForCopyModal from '../utils/copy_hierarchy_loader';
import boardsPageListCache from '../utils/boards_page_list_cache';
import { board_edit_route } from '../utils/board_view';

// Best-effort human-readable form of whatever the copy chain rejected with, for
// the background drawer (which renders a plain string, unlike the modal's error
// slot). Falls back to a generic message rather than printing "[object Object]".
function copy_error_message(err) {
  if (typeof err === 'string') { return err; }
  if (err && typeof err.error === 'string') { return err.error; }
  if (err && typeof err.message === 'string') { return err.message; }
  return i18n.t('copy_failed_background', "Copying the board failed. Please try again.");
}

/**
 * Copying Board progress modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  router: service('router'),
  copyProgress: service('copy-progress'),
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
    // Assigned here rather than in didInsertElement: this component renders
    // <ModalDialog> as a child, so anything the template hands to it must exist
    // before the first render (a later plain assignment never re-binds).
    this.onBackdropClose = function() {
      self.send('backdrop_close');
    };
    /*
     * Same reason, same render: <ModalDialog> reads @action/@opening/@closing on
     * its FIRST render, and didInsertElement runs after that, so these were
     * undefined on the pass that matters -- the bind-before-assign class fixed for
     * three other modals in 650d30685. @action stayed undefined in practice, and
     * modal-dialog's fallback (utils/modal.close) is the only reason the Escape
     * key behaved correctly. That makes this change load-bearing on the close()
     * fix above: defining onClose without it would hand Escape the same stale-flag
     * navigation the X had.
     */
    this.onClose = function() { self.send('close'); };
    this.onOpening = function() { self.send('opening'); };
    this.onClosing = function() { self.send('closing'); };

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
    } else if (this.get('model.skip_hierarchy_picker')) {
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
    const live_links_incomplete = this.get('hierarchy.live_links_incomplete') || this.get('model.expand_selected_board_ids_to_copy');
    if (include_missing) {
      board_ids_to_include = null;
      this.set('hierarchy', null);
    } else if (this.get('hierarchy') && this.get('hierarchy').selected_board_ids) {
      board_ids_to_include = this.get('hierarchy').selected_board_ids();
      this.set('hierarchy', null);
    } else if (this.get('model.board_ids_to_copy')) {
      board_ids_to_include = this.get('model.board_ids_to_copy');
    }
    board.set('downstream_board_ids_to_copy', board_ids_to_include);
    board.set('expand_selected_board_ids_to_copy', !include_missing && live_links_incomplete);
    const _this = this;
    const model = this.get('model') || {};
    const modalSvc = this.get('modal');
    const appState = this.get('appState');
    // Services are captured up front because this modal may be closed (and this
    // component destroyed) while the copy is still running -- the promise chain
    // below outlives it, so it must not reach through `this` for anything.
    const copyProgress = this.get('copyProgress');
    // Shared handle for THIS copy job. `token` is null while the modal is in the
    // foreground and is stamped by minimize() when the user sends the copy to the
    // background drawer, so the settle handlers can tell which way to report.
    const progress = { token: null };
    this._active_progress = progress;
    this.set('copying', true);
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
        _this.clear_copying();
        /* Invalidate Mine-list snapshot for the copy destination user so
           /boards does not keep serving a pre-copy list within TTL. */
        try {
          var destUser = model.user;
          var destId = destUser && (destUser.get ? destUser.get('id') : destUser.id);
          if (destId) { boardsPageListCache.clear(destId); }
        } catch (e) { /* non-critical */ }
        // Backgrounded copy: the user is off doing something else, so OFFER the
        // new board rather than navigating to it. The foreground branch below
        // jumps / transitions outright, and model.copy_finished transitions too
        // -- neither is welcome when they chose to keep working. The result card
        // carries the same destination behind an "Open Board" button instead.
        if (progress.token) {
          // Same freshness guarantee the foreground jump gives itself -- "Open
          // Board" may be clicked minutes later.
          copiedBoard.set('should_reload', true);
          copyProgress.complete(progress.token, i18n.t('copy_ready', "Copy created!"), {
            id: copiedBoard.get('id'),
            key: copiedBoard.get('key'),
            for_editing: !!model.for_editing
          });
          return;
        }
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
              // View-aware edit destination. board-detail has an /edit subroute; the
              // classic board has none (router.js declares only `index` under board-alt) —
              // classic editing is a MODE entered via app_state.toggle_edit_mode. So a
              // classic user lands on their own board here rather than being ejected into
              // modern. KNOWN GAP: edit mode is not auto-entered for them; closing that
              // needs the classic edit route (Cluster C in the restoration plan).
              _this.get('router').transitionTo(board_edit_route(_this.get('appState.currentUser')), editParts[0], editParts.slice(1).join('/'));
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
        _this.clear_copying();
        if (progress.token) {
          copyProgress.fail(progress.token, copy_error_message(err));
          return;
        }
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
      _this.clear_copying();
      if (progress.token) {
        copyProgress.fail(progress.token, copy_error_message(err));
        return;
      }
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

  // The copy has settled, so a backdrop click is a plain dismissal again. Called
  // from the settle handlers, which also run when the copy was backgrounded and
  // this component no longer exists -- hence the destroyed guard.
  clear_copying() {
    if (this.get('isDestroyed') || this.get('isDestroying')) { return; }
    this.set('copying', false);
  },

  // Send an in-flight copy to the bottom-right drawer and close the modal. The
  // copy itself is untouched: it lives in the promise chain started by
  // start_copying(), which reports its result through the copy-progress service.
  minimize() {
    const board = this.get('model.board');
    const progress = this._active_progress;
    const token = this.get('copyProgress').minimize({
      board_key: board && board.get('key')
    });
    if (progress) { progress.token = token; }
    // utils/modal.close (not the service's) so BOTH the service state and the
    // legacy _component_based_template flag are cleared -- otherwise
    // modal.is_open('copying-board') would keep reporting true.
    modal.close();
  },

  actions: {
    /*
     * utils/modal.close, NOT the service's -- the same reason minimize() gives
     * above. The service close leaves utils/modal._component_based_template set,
     * so modal.is_open('copying-board') keeps reporting true; a copy still running
     * when the user dismissed then takes the FOREGROUND branch of start_copying's
     * settle handler and navigates. Measured before this fix: dismissing an
     * in-flight copy with the X moved the user /caseload ->
     * /<user>/board-detail/one_4. Dismiss has to mean dismiss. The settle
     * handler's else-branch already handles a dismissed copy properly -- it calls
     * model.copy_finished, or reports "Copy created!" as a notice.
     */
    close() {
      modal.close();
    },
    // Clicking outside the modal while the copy is actually running minimizes it
    // instead of dismissing it. Every other state (hierarchy load, board picker,
    // an error on display) keeps the plain close-on-backdrop behavior.
    backdrop_close() {
      if (this.get('copying') && !this.get('error')) {
        this.minimize();
      } else {
        modal.close();
      }
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

});
