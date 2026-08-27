import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import modal from '../utils/modal';
import BoardHierarchy from '../utils/board_hierarchy';
import i18n from '../utils/i18n';
import app_state from '../utils/app_state';
import persistence from '../utils/persistence';
import progress_tracker from '../utils/progress_tracker';
import stashes from '../utils/_stashes';

/**
 * Translation Select modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  tagName: '',

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
    const template = 'translation-select';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
    if (options.translate_locale) {
      this.set('translate_locale', options.translate_locale);
    }
  },

  didInsertElement() {
    this._super(...arguments);
    var self = this;
    this.onClose = function() { self.send('close'); };
    this.onOpening = function() { self.send('opening'); };
    this.onClosing = function() { self.send('closing'); };
    const _this = this;
    _this.set('switch_status', null);
    _this.set('default_language', true);
    _this.set('hierarchy', { loading: true });
    var board = this.get('model.board');
    var loadHierarchy = function() {
      return BoardHierarchy.load_with_button_set(board, {
        deselect_on_different: true,
        prevent_different: true,
        skipBoardReloadForCopyModal: true
      }).then(function(hierarchy) {
        _this.set('hierarchy', hierarchy);
      }, function() {
        _this.set('hierarchy', { error: true });
      });
    };
    if (board && board.reload) {
      board.reload(true).then(loadHierarchy, loadHierarchy);
    } else {
      loadHierarchy();
    }
  },

  locales: computed(function() {
    const list = i18n.get('translatable_locales');
    const res = [{ name: i18n.t('choose_locale', '[Choose a Language]'), id: '' }];
    for (const key in list) {
      res.push({ name: list[key], id: key });
    }
    res.push({ name: i18n.t('unspecified', "Unspecified"), id: '' });
    return res;
  }),

  can_edit_board: computed('model.board.permissions.edit', function() {
    var board = this.get('model.board');
    if (!board) { return false; }
    if (board.get && board.get('permissions.edit')) { return true; }
    return !!(board.permissions && board.permissions.edit);
  }),

  cannot_translate: computed('can_edit_board', function() {
    return !this.get('can_edit_board');
  }),

  source_locale: computed('model.board.locale', 'model.board.translations', function() {
    var board = this.get('model.board');
    var trans = (board && board.get && board.get('translations')) || {};
    return trans.default || (board && board.get && board.get('locale')) || 'en';
  }),

  not_ready: computed('can_start_translation', function() {
    return !this.get('can_start_translation');
  }),

  existing_default_language: computed('default_language', 'translate_locale', 'model.board.locales', function() {
    const loc = this.get('translate_locale');
    const list = this.get('model.board.locales') || [];
    return this.get('default_language') && list.indexOf(loc) !== -1;
  }),

  is_source_language: computed('translate_locale', 'model.board.locale', 'model.board.translations', function() {
    const loc = this.get('translate_locale');
    if (!loc) { return false; }
    const board = this.get('model.board');
    const trans = (board && board.get && board.get('translations')) || {};
    const source = trans.default || (board && board.get && board.get('locale')) || 'en';
    const locRoot = loc.split(/-|_/)[0];
    const sourceRoot = String(source).split(/-|_/)[0];
    return loc === source || locRoot === sourceRoot;
  }),

  can_start_translation: computed(
    'translate_locale',
    'existing_default_language',
    'is_source_language',
    'can_edit_board',
    'hierarchy.loading',
    'hierarchy.error',
    function() {
      if (!this.get('can_edit_board')) { return false; }
      var hierarchy = this.get('hierarchy');
      if (hierarchy && (hierarchy.loading || hierarchy.error)) { return false; }
      return !!this.get('translate_locale') && !this.get('existing_default_language') && !this.get('is_source_language');
    }
  ),

  can_retranslate: computed(
    'existing_default_language',
    'is_source_language',
    'can_edit_board',
    'hierarchy.loading',
    'hierarchy.error',
    function() {
      if (!this.get('can_edit_board')) { return false; }
      var hierarchy = this.get('hierarchy');
      if (hierarchy && (hierarchy.loading || hierarchy.error)) { return false; }
      return !!this.get('existing_default_language') && !this.get('is_source_language');
    }
  ),

  retranslate_not_ready: computed('can_retranslate', function() {
    return !this.get('can_retranslate');
  }),

  switch_language_not_ready: computed('switch_status.pending', 'can_edit_board', function() {
    return !!this.get('switch_status.pending') || !this.get('can_edit_board');
  }),

  cannot_copy_board: computed('model.board.copying_state.none', function() {
    return !!this.get('model.board.copying_state.none');
  }),

  translate_copy_not_ready: computed('translate_locale', 'copy_status.pending', 'cannot_copy_board', function() {
    return !this.get('translate_locale') || !!this.get('copy_status.pending') || this.get('cannot_copy_board');
  }),

  source_language_name: computed('translate_locale', 'model.board.locale', 'model.board.translations', function() {
    const board = this.get('model.board');
    const trans = (board && board.get && board.get('translations')) || {};
    const source = trans.default || (board && board.get && board.get('locale')) || 'en';
    return i18n.readable_language(this.get('translate_locale') || source);
  }),

  _track_translation_progress(progress, onEvent, flashKey, flashDefault) {
    app_state.set('board_translate_in_progress', true);
    modal.flash(i18n.t(flashKey || 'applying_translations', flashDefault || "Applying Translations..."), 'notice', false, true);
    var track_id = null;
    track_id = progress_tracker.track(progress, function(event) {
      if (progress_tracker.is_terminal(event)) {
        app_state.set('board_translate_in_progress', false);
        modal.close('flash');
        progress_tracker.untrack(track_id);
      }
      if (typeof onEvent === 'function') {
        onEvent(event);
      }
    });
  },

  done_translating(new_default) {
    const _this = this;
    return _this.get('model.board').reload(true).then(function() {
      if (new_default) {
        const new_locale = _this.get('model.board.locale');
        /* Update the session locale whenever the user explicitly set
           this language as the board's default. The prior gate on
           `currentBoardState.id === model.board.id` only matched in
           speak mode, so the board-detail edit view kept showing
           stale English labels after a translation completed until
           you navigated away. Now updates in any mode. */
        app_state.set('label_locale', new_locale);
        app_state.set('vocalization_locale', new_locale);
        stashes.persist('label_locale', new_locale);
        stashes.persist('vocalization_locale', new_locale);
        if (app_state.get('currentBoardState.id') === _this.get('model.board.id')) {
          app_state.set('currentBoardState.default_locale', new_locale);
        }
      }
      app_state.set('board_reload_key', Math.random() + '-' + (new Date()).getTime());
    });
  },

  actions: {
    nothing() {},
    close() {
      /* Close to the page the user started on — don't reopen the
         board-details info modal. The prior `_return_to_details()`
         call assumed users always reached Translate from the
         board-details modal, but the actual path is via Board
         Actions modal from the board-detail edit page, so reopening
         board-details landed them somewhere they never opened. */
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    updateTranslateLocale(value) {
      this.set('translate_locale', value);
    },
    translate_copy() {
      var _this = this;
      var board = this.get('model.board');
      var appController = this.get('appState.controller') || (app_state && app_state.get && app_state.get('controller'));
      if (!board || !appController || typeof appController.copy_board !== 'function') {
        modal.flash(i18n.t('copy_board_unavailable', "Board copying is not available right now."), 'error');
        return;
      }
      if (!this.get('translate_locale')) {
        modal.flash(i18n.t('choose_language_before_copy_translate', "Choose a language before translating a copy."), 'error');
        return;
      }
      if (this.get('cannot_copy_board')) {
        modal.flash(i18n.t('cant_copy_protected_boards', "This board contains purchased content which can't be copied."), 'error');
        return;
      }
      _this.set('copy_status', { pending: true });
      var has_links = !!((board.get && board.get('linked_boards.length')) ||
        (board.get && board.get('downstream_boards')) ||
        (board.get && board.get('downstream_board_ids.length')));
      appController.copy_board({
        copy_board_source: board,
        action: has_links ? 'links_copy' : 'keep_links',
        user: this.get('appState.currentUser'),
        translate_locale: this.get('translate_locale'),
        default_locale: this.get('source_locale')
      }, false, null, null, board, true).then(function() {
        _this.set('copy_status', null);
        _this.get('modal').close({ copied: true, translated: true });
      }, function(err) {
        _this.set('copy_status', { error: true });
        if (err) {
          modal.error(err);
        }
      });
    },
    switch_language() {
      const _this = this;
      if (!this.get('can_edit_board')) {
        modal.flash(i18n.t('board_translate_edit_permission_required', "You need editing permission for this board before you can translate it."), 'error');
        return;
      }
      _this.set('switch_status', { pending: true });
      let board_ids_to_include = null;
      if (this.get('hierarchy') && this.get('hierarchy').selected_board_ids) {
        board_ids_to_include = this.get('hierarchy').selected_board_ids();
      }
      /* Apply cached translations only — no new Google Translate work.
         `fallbacks` reads stored per-button strings; `force_update_default`
         ensures labels swap even when board.locale already matches dest. */
      persistence.ajax('/api/v1/boards/' + _this.get('model.board.id') + '/translate', {
        type: 'POST',
        contentType: 'application/json',
        dataType: 'json',
        data: JSON.stringify({
          source_lang: _this.get('source_locale'),
          destination_lang: _this.get('translate_locale'),
          set_as_default: true,
          fallbacks: 'true',
          force_update_default: true,
          translations: {},
          board_ids_to_translate: board_ids_to_include && board_ids_to_include.toArray ? board_ids_to_include.toArray() : board_ids_to_include
        })
      }).then(function(res) {
        _this._track_translation_progress(res.progress, function(event) {
          if (progress_tracker.is_errored(event) || (progress_tracker.is_finished(event) && event.result && event.result.translated === false)) {
            _this.set('switch_status', { error: true });
          } else if (progress_tracker.is_finished(event)) {
            _this.set('switch_status', null);
            _this.done_translating(true);
            _this.get('modal').close({ switched: true });
          }
        }, 'switching_language', "Switching Language...");
      }, function() {
        _this.set('switch_status', { error: true });
      });
    },
    translate(force_update_default) {
      const _this = this;
      if (!this.get('can_edit_board')) {
        modal.flash(i18n.t('board_translate_edit_permission_required', "You need editing permission for this board before you can translate it."), 'error');
        return;
      }
      let board_ids_to_include = null;
      if (this.get('hierarchy') && this.get('hierarchy').selected_board_ids) {
        board_ids_to_include = this.get('hierarchy').selected_board_ids();
      }
      /* Re-Translate intentionally overwrites visible labels for an
         existing locale. Normal translation keeps the historical default. */
      const force_update = force_update_default === true;
      const translate_opts = {
        board: _this.get('model.board'),
        copy: _this.get('model.board'),
        button_set: (_this.get('hierarchy') && _this.get('hierarchy.button_set')) || _this.get('model.board.button_set'),
        locale: _this.get('translate_locale'),
        source_locale: force_update ? _this.get('source_locale') : _this.get('model.board.locale'),
        default_language: _this.get('default_language'),
        force_update_default: force_update,
        old_board_ids_to_translate: board_ids_to_include,
        new_board_ids_to_translate: board_ids_to_include
      };
      return modal.open('button-set', translate_opts).then(function(res) {
        if (res && res.translated) {
          return _this.done_translating(translate_opts.default_language).then(function() {
            _this.get('modal').close({ translated: true });
            modal.flash(i18n.t('translations_applied', "Translations applied."), 'notice');
          });
        }
      });
    }
  }
});
