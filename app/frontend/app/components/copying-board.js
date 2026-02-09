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
      BoardHierarchy.load_with_button_set(board).then(function(hierarchy) {
        _this.set('loading', false);
        if (hierarchy && hierarchy.get('root')) {
          _this.set('hierarchy', hierarchy);
        } else {
          _this.start_copying();
        }
      }, function(err) {
        _this.set('loading', false);
        _this.set('error', err);
      });
    }
  },

  start_copying() {
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
        return board.reload(true);
      });
      next.then(function(res) {
        if (modal.is_open('copying-board') || (res && res.translated)) {
          board.reload();
          board.set('should_reload', true);
          _this.get('appState').jump_to_board({
            id: board.get('id'),
            key: board.get('key')
          });
          modal.close({ copied: true, id: board.get('id'), key: board.get('key') });
        } else {
          modal.notice(i18n.t('copy_created', 'Copy created! You can find the new board in your profile.'));
        }
      }, function(err) {
        if (modal.is_open('copying-board')) {
          _this.set('error', err);
        } else {
          modal.error(err);
        }
      });
    }, function(err) {
      if (modal.is_open('copying-board')) {
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
