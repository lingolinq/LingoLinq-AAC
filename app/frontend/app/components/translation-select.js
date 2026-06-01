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
  tagName: '',

  init() {
    this._super(...arguments);
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
    const _this = this;
    _this.set('switch_status', null);
    _this.set('default_language', true);
    _this.set('hierarchy', { loading: true });
    BoardHierarchy.load_with_button_set(this.get('model.board'), { deselect_on_different: true, prevent_different: true }).then(function(hierarchy) {
      _this.set('hierarchy', hierarchy);
    }, function() {
      _this.set('hierarchy', { error: true });
    });
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

  can_start_translation: computed('translate_locale', 'existing_default_language', 'is_source_language', function() {
    return !!this.get('translate_locale') && !this.get('existing_default_language') && !this.get('is_source_language');
  }),

  source_language_name: computed('translate_locale', 'model.board.locale', 'model.board.translations', function() {
    const board = this.get('model.board');
    const trans = (board && board.get && board.get('translations')) || {};
    const source = trans.default || (board && board.get && board.get('locale')) || 'en';
    return i18n.readable_language(this.get('translate_locale') || source);
  }),

  _track_translation_progress(progress, onEvent) {
    app_state.set('board_translate_in_progress', true);
    modal.flash(i18n.t('applying_translations', "Applying Translations..."), 'notice', false, true);
    progress_tracker.track(progress, function(event) {
      if (event.status === 'finished' || event.status === 'errored') {
        app_state.set('board_translate_in_progress', false);
        modal.close('flash');
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
    switch_language() {
      const _this = this;
      _this.set('switch_status', { pending: true });
      const loc = this.get('translate_locale');
      let board_ids_to_include = null;
      if (this.get('hierarchy') && this.get('hierarchy').selected_board_ids) {
        board_ids_to_include = this.get('hierarchy').selected_board_ids();
      }
      persistence.ajax('/api/v1/boards/' + _this.get('model.board.id') + '/translate', {
        type: 'POST',
        data: {
          source_lang: _this.get('model.board.locale'),
          destination_lang: _this.get('translate_locale'),
          set_as_default: true,
          translations: {},
          board_ids_to_translate: board_ids_to_include
        }
      }).then(function(res) {
        _this._track_translation_progress(res.progress, function(event) {
          if (event.status === 'errored' || (event.status === 'finished' && event.result && event.result.translated === false)) {
            _this.set('switch_status', { error: true });
          } else if (event.status === 'finished') {
            _this.set('switch_status', null);
            _this.done_translating(true);
            modal.close({ translated: true });
          }
        });
      }, function() {
        _this.set('switch_status', { error: true });
      });
    },
    translate(switch_if_possible) {
      const _this = this;
      let board_ids_to_include = null;
      if (this.get('hierarchy') && this.get('hierarchy').selected_board_ids) {
        board_ids_to_include = this.get('hierarchy').selected_board_ids();
      }
      /* Re-Translate removed from UI — force_update_default kept for
         admin/support tooling only; never set from this modal. */
      const force_update = false;
      const translate_opts = {
        board: _this.get('model.board'),
        copy: _this.get('model.board'),
        button_set: _this.get('model.board.button_set'),
        locale: _this.get('translate_locale'),
        default_language: _this.get('default_language'),
        force_update_default: force_update,
        old_board_ids_to_translate: board_ids_to_include,
        new_board_ids_to_translate: board_ids_to_include
      };
      return modal.open('button-set', translate_opts).then(function(res) {
        if (res && res.translated) {
          _this.done_translating(translate_opts.default_language);
        }
      });
    }
  }
});
