import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import modal from '../utils/modal';
import BoardHierarchy from '../utils/board_hierarchy';
import i18n from '../utils/i18n';
import app_state from '../utils/app_state';
import persistence from '../utils/persistence';
import progress_tracker from '../utils/progress_tracker';

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
  },

  didInsertElement() {
    this._super(...arguments);
    const _this = this;
    _this.set('switch_status', { pending: true });
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

  existing_default_language: computed('default_language', 'translate_locale', 'model.board.locales', function() {
    const loc = this.get('translate_locale');
    const list = this.get('model.board.locales') || [];
    return this.get('default_language') && list.indexOf(loc) !== -1;
  }),

  done_translating(new_default) {
    const _this = this;
    return _this.get('model.board').reload(true).then(function() {
      if (new_default && app_state.get('currentBoardState.id') === _this.get('model.board.id')) {
        app_state.set('currentBoardState.default_locale', _this.get('model.board.locale'));
        app_state.set('label_locale', _this.get('model.board.locale'));
        app_state.set('vocalization_locale', _this.get('model.board.locale'));
      }
      app_state.set('board_reload_key', Math.random() + '-' + (new Date()).getTime());
    });
  },

  actions: {
    nothing() {},
    close() {
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
        progress_tracker.track(res.progress, function(event) {
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
      const translate_opts = {
        board: _this.get('model.board'),
        copy: _this.get('model.board'),
        button_set: _this.get('model.board.button_set'),
        locale: _this.get('translate_locale'),
        default_language: _this.get('default_language'),
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
