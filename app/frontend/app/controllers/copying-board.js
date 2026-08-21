import RSVP from 'rsvp';
import modal from '../utils/modal';
import editManager from '../utils/edit_manager';
import app_state from '../utils/app_state';
import i18n from '../utils/i18n';
import loadHierarchyForCopyModal from '../utils/copy_hierarchy_loader';

export default modal.ModalController.extend({
  opening: function() {
    var _this = this;
    _this.set('loading', true);
    _this.set('error', null);
    _this.set('hierarchyLoadFailed', false);
    _this.set('hierarchyRootOnlyWarning', false);
    _this.set('isTimeoutError', false);
    var board = _this.get('model.board');
    if(this.get('model.action') == 'keep_links' || this.get('model.action') == 'remove_links') {
      _this.start_copying();
      return;
    }
    if(this.get('model.skip_hierarchy_picker')) {
      _this.start_copying();
      return;
    }

    loadHierarchyForCopyModal(board, {
      skipBoardReloadForCopyModal: true,
      expand_all: true,
      early_live_links_delay_ms: this.get('earlyLiveLinksDelayMs')
    }).then(function(result) {
      if(_this.isDestroyed || _this.isDestroying) { return; }
      _this.set('loading', false);
      var hierarchy = result.hierarchy;
      if(!hierarchy) {
        _this.start_copying();
        return;
      }
      if(result.source == 'live_links') {
        _this.set('hierarchyRootOnlyWarning', true);
      } else {
        var rootChildren = hierarchy.get('root.children') || [];
        var expectedLinkedBoards =
          (board.get('linked_boards.length') || 0) > 0 ||
          (board.get('downstream_boards') || 0) > 0 ||
          (board.get('downstream_board_ids.length') || 0) > 0;
        _this.set('hierarchyRootOnlyWarning', expectedLinkedBoards && rootChildren.length === 0);
      }
      _this.set('hierarchy', hierarchy);
    }, function(err) {
      if(_this.isDestroyed || _this.isDestroying) { return; }
      _this.set('loading', false);
      _this.set('error', err);
      _this.set('hierarchyLoadFailed', true);
      if(err && (err.error == 'buttonset load timed out' || err.error == 'generation_stalled')) {
        _this.set('isTimeoutError', true);
      }
    });
  },
  start_copying: function() {
    this.set('loading', false);
    var board_ids_to_include = null;
    var include_missing = this.get('includeMissing') || this.get('hierarchy.include_missing');
    var live_links_incomplete = this.get('hierarchy.live_links_incomplete') || this.get('model.expand_selected_board_ids_to_copy');
    if(include_missing) {
      board_ids_to_include = null;
      this.set('hierarchy', null);
    } else if(this.get('hierarchy') && this.get('hierarchy').selected_board_ids) {
      board_ids_to_include = this.get('hierarchy').selected_board_ids();
      this.set('hierarchy', null);
    } else if(this.get('model.board_ids_to_copy')) {
      board_ids_to_include = this.get('model.board_ids_to_copy');
    }
    this.get('model.board').set('downstream_board_ids_to_copy', board_ids_to_include);
    this.get('model.board').set('expand_selected_board_ids_to_copy', !include_missing && live_links_incomplete);
    var _this = this;
    _this.set('model.board.default_locale', null);
    if(this.get('model.default_locale') && this.get('model.board.locale') != this.get('model.default_locale')) {
      _this.set('model.board.default_locale', this.get('model.default_locale'));
    }
    editManager.copy_board(_this.get('model.board'), _this.get('model.action'), _this.get('model.user'), _this.get('model.make_public'), _this.get('model.symbol_library'), _this.get('model.new_owner'), _this.get('model.disconnect')).then(function(board) {
      var next = RSVP.resolve();
      var new_board_ids = board_ids_to_include ? board.get('new_board_ids') : null;
      if(_this.get('model.shares') && _this.get('model.shares').length > 0) {
        var promises = [];
        _this.get('model.shares').forEach(function(share) {
          next = next.then(function() {
            var user_name = share.user_name;
            var sharing_key = "add_deep-" + user_name;
            board.set('sharing_key', sharing_key);
            return board.save();
          });
        });
        next = next.then(null, function() {
          return RSVP.reject(i18n.t('sharing_failed', "Sharing with one or more users failed"));
        });
      }

      next = next.then(function() {
        if(_this.get('model.translate_locale')) {
          return _this.get('model.board').load_button_set(true).then(function() {
            var translate_opts = {
              board: _this.get('model.board'),
              copy: board,
              button_set: _this.get('model.board.button_set'),
              locale: _this.get('model.translate_locale'),
              old_board_ids_to_translate: board_ids_to_include,
              new_board_ids_to_translate: new_board_ids
            };
            return modal.open('button-set', translate_opts).then(function(res) {
              if(res && res.translated) {
                return board.reload(true).then(function() {
                  return RSVP.resolve({translated: true});
                });
              } else {
                return RSVP.reject(i18n.t('translation_canceled', "Translation was canceled"));
              }
            });
          });
        } else if(_this.get('model.symbol_library') && _this.get('model.symbol_library') != 'original') {
          board.reload(true).then(null, function() {});
          return RSVP.resolve(null);
        } else {
          board.reload(true).then(null, function() {});
          return RSVP.resolve(null);
        }
      });

      next.then(function(res) {
        if(modal.is_open('copying-board') || (res && res.translated === true)) {
          // Foreground completion: queue a success toast BEFORE the
          // jump so the new board's page renders with the toast
          // already on screen (modal.success routes through the
          // application-level toast outlet which survives the route
          // transition). The pre-existing background-completion branch
          // below already toasts; this closes the gap where a
          // foreground copy used to whisk the user away in silence.
          // 6000ms (vs the flash() default of 3000ms) because the
          // jump_to_board → speak-mode transition typically chews ~1–2s
          // of that window before the user is looking at the new board
          // — a default-length toast was disappearing during the redirect
          // and the user reported never seeing a success message.
          modal.success(i18n.t('board_copied_loading', "Board copied! Loading your new board..."), false, false, {timeout: 6000});
          board.set('should_reload', true);
          app_state.jump_to_board({
            id: board.get('id'),
            key: board.get('key')
          });
          modal.close({copied: true, id: board.get('id'), key: board.get('key')});
        } else {
          // Background-completion path: user already closed the modal,
          // so they're on the previous page and there's no redirect to
          // race the toast — keep the default duration here.
          modal.notice(i18n.t('copy_created', "Copy created! You can find the new board in your profile."));
        }
      }, function(err) {
        if(modal.is_open('copying-board')) {
          _this.set('error', err);
        } else {
          modal.error(err);
        }
      });
    }, function(err) {
      if(modal.is_open('copying-board')) {
        _this.set('error', err);
      } else {
        modal.error(err);
      }
    });
  },
  actions: {
    confirm_hierarchy: function() {
      this.start_copying();
    },
    start_copying: function() {
      this.start_copying();
    },
    // Override the default close so callers can distinguish a clean
    // cancel from a backend-error close. When an error has been set
    // on this modal (loadHierarchy / editManager.copy_board / share /
    // translate paths all set _this.error), pass the error along to
    // modal.close so tweakBoard (application.js) can surface it and
    // clear the copy_on_save stash. Otherwise close cleanly.
    close: function() {
      if(this.get('error')) {
        modal.close({error: this.get('error')});
      } else {
        modal.close();
      }
    },
    copy_all: function() {
      this.set('includeMissing', true);
      this.start_copying();
    }
  }
});
