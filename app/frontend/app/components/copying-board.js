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
    const board = _this.get('model.board');
    if (this.get('model.action') === 'keep_links' || this.get('model.action') === 'remove_links') {
      _this.start_copying();
    } else {
      BoardHierarchy.load_with_button_set(board, { skipBoardReloadForCopyModal: true }).then(function(hierarchy) {
        // #region agent log
        fetch('http://127.0.0.1:7311/ingest/24105c53-d0a7-47df-94d5-11a8d0f5e6dc',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'32f630'},body:JSON.stringify({sessionId:'32f630',hypothesisId:'H3',location:'copying-board.js:runOpening',message:'hierarchy load settled',data:{hasRoot:!!(hierarchy&&hierarchy.get('root'))},timestamp:Date.now()})}).catch(function(){});
        // #endregion
        _this.set('loading', false);
        if (hierarchy && hierarchy.get('root')) {
          _this.set('hierarchy', hierarchy);
        } else {
          _this.start_copying();
        }
      }, function(err) {
        // #region agent log
        fetch('http://127.0.0.1:7311/ingest/24105c53-d0a7-47df-94d5-11a8d0f5e6dc',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'32f630'},body:JSON.stringify({sessionId:'32f630',hypothesisId:'H4',location:'copying-board.js:runOpening',message:'hierarchy load rejected',data:{errKey:err&&(err.error||err.message)||'unknown'},timestamp:Date.now()})}).catch(function(){});
        // #endregion
        _this.set('loading', false);
        _this.set('error', err);
      });
    }
  },

  start_copying() {
    // keep_links/remove_links skip hierarchy load — still clear loading so the modal
    // shows the in-progress copy message instead of staying on "Loading...".
    this.set('loading', false);
    let board_ids_to_include = null;
    const include_missing = this.get('hierarchy.include_missing');
    if (include_missing) {
      board_ids_to_include = null;
      this.set('hierarchy', null);
    } else if (this.get('hierarchy') && this.get('hierarchy').selected_board_ids) {
      board_ids_to_include = this.get('hierarchy').selected_board_ids();
      this.set('hierarchy', null);
    }
    this.get('model.board').set('downstream_board_ids_to_copy', board_ids_to_include);
    const _this = this;
    _this.set('model.board.default_locale', null);
    if (this.get('model.default_locale') && this.get('model.board.locale') !== this.get('model.default_locale')) {
      _this.set('model.board.default_locale', this.get('model.default_locale'));
    }
    editManager.copy_board(_this.get('model.board'), _this.get('model.action'), _this.get('model.user'), _this.get('model.make_public'), _this.get('model.symbol_library'), _this.get('model.new_owner'), _this.get('model.disconnect')).then(function(board) {
      let next = RSVP.resolve();
      const new_board_ids = board_ids_to_include ? board.get('new_board_ids') : null;
      if (_this.get('model.shares') && _this.get('model.shares').length > 0) {
        _this.get('model.shares').forEach(function(share) {
          next = next.then(function() {
            const user_name = share.user_name;
            board.set('sharing_key', 'add_deep-' + user_name);
            return board.save();
          });
        });
        next = next.then(null, function() {
          return RSVP.reject(i18n.t('sharing_failed', 'Sharing with one or more users failed'));
        });
      }
      next = next.then(function() {
        if (_this.get('model.translate_locale')) {
          return _this.get('model.board').load_button_set(true).then(function() {
            const translate_opts = {
              board: _this.get('model.board'),
              copy: board,
              button_set: _this.get('model.board.button_set'),
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
        board.reload(true).then(null, function() {});
        return RSVP.resolve(null);
      });
      next.then(function(res) {
        const modalSvc = _this.get('modal');
        const translatedResult = !!(res && res.translated === true);
        const copyingOpen =
          modal.is_open('copying-board') ||
          (modalSvc && typeof modalSvc.isOpen === 'function' && modalSvc.isOpen('copying-board'));
        if (copyingOpen || translatedResult) {
          board.set('should_reload', true);
          _this.get('appState').jump_to_board({
            id: board.get('id'),
            key: board.get('key')
          });
          modal.close({ copied: true, id: board.get('id'), key: board.get('key') });
          if (modalSvc && typeof modalSvc.isOpen === 'function' && modalSvc.isOpen('copying-board')) {
            modalSvc.close({ copied: true, id: board.get('id'), key: board.get('key') });
          }
        } else {
          modal.notice(i18n.t('copy_created', 'Copy created! You can find the new board in your profile.'));
        }
      }, function(err) {
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
    }
  }
});
