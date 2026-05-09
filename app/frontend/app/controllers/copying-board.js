import RSVP from 'rsvp';
import { later, cancel } from '@ember/runloop';
import modal from '../utils/modal';
import editManager from '../utils/edit_manager';
import app_state from '../utils/app_state';
import BoardHierarchy from '../utils/board_hierarchy';
import i18n from '../utils/i18n';

// After this many ms of waiting on the buttonset hierarchy load, kick off the
// live-links walk in parallel and accept whichever returns a usable hierarchy
// first. The buttonset path can hang up to 60s when its remote data is missing
// or stale (typical right after a bulk copy while the :slow Resque queue
// drains the deferred update_for jobs).
var EARLY_LIVE_LINKS_DELAY_MS = 6000;

function loadHierarchyForCopyModal(board, opts) {
  opts = opts || {};
  var earlyDelay = opts.early_live_links_delay_ms != null
    ? opts.early_live_links_delay_ms
    : EARLY_LIVE_LINKS_DELAY_MS;

  return new RSVP.Promise(function(resolve, reject) {
    var settled = false;
    var bs_done = false;
    var ll_done = false;
    var ll_started = false;
    var bs_err = null;
    var early_handle = null;

    var settle_with = function(hierarchy, source) {
      if(settled) { return; }
      settled = true;
      if(early_handle) { cancel(early_handle); early_handle = null; }
      resolve({ hierarchy: hierarchy, source: source });
    };

    var maybe_finalize = function() {
      if(settled) { return; }
      if(bs_done && ll_done) {
        settled = true;
        if(early_handle) { cancel(early_handle); early_handle = null; }
        if(bs_err) {
          reject(bs_err);
        } else {
          resolve({ hierarchy: null, source: 'none' });
        }
      }
    };

    var start_live_links = function() {
      if(ll_started || settled) { return; }
      ll_started = true;
      if(early_handle) { cancel(early_handle); early_handle = null; }
      BoardHierarchy.load_from_live_links(board, {
        expand_all: opts.expand_all
      }).then(function(hierarchy) {
        ll_done = true;
        if(hierarchy && hierarchy.get && hierarchy.get('root')) {
          settle_with(hierarchy, 'live_links');
        } else {
          maybe_finalize();
        }
      }, function() {
        ll_done = true;
        maybe_finalize();
      });
    };

    BoardHierarchy.load_with_button_set(board, {
      skipBoardReloadForCopyModal: opts.skipBoardReloadForCopyModal,
      expand_all: opts.expand_all
    }).then(function(hierarchy) {
      bs_done = true;
      if(hierarchy && hierarchy.get && hierarchy.get('root')) {
        settle_with(hierarchy, 'button_set');
      } else {
        // null hierarchy from buttonset (no buttonset for this board); try
        // live-links immediately rather than waiting for the early-fire timer.
        start_live_links();
      }
    }, function(err) {
      bs_done = true;
      bs_err = err;
      // Buttonset rejected (timeout, generation_stalled, etc). Try live-links
      // immediately, do not wait for the early-fire timer.
      start_live_links();
    });

    early_handle = later(function() {
      early_handle = null;
      start_live_links();
    }, earlyDelay);
  });
}

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
    if(include_missing) {
      board_ids_to_include = null;
      this.set('hierarchy', null);
    } else if(this.get('hierarchy') && this.get('hierarchy').selected_board_ids) {
      board_ids_to_include = this.get('hierarchy').selected_board_ids();
      this.set('hierarchy', null);
    }
    this.get('model.board').set('downstream_board_ids_to_copy', board_ids_to_include);
    this.get('model.board').set('expand_selected_board_ids_to_copy', !include_missing && this.get('hierarchy.live_links_incomplete'));
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
          board.set('should_reload', true);
          app_state.jump_to_board({
            id: board.get('id'),
            key: board.get('key')
          });
          modal.close({copied: true, id: board.get('id'), key: board.get('key')});
        } else {
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
    copy_all: function() {
      this.set('includeMissing', true);
      this.start_copying();
    }
  }
});
