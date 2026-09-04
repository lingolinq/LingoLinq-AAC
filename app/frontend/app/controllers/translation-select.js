import modal from '../utils/modal';
import BoardHierarchy from '../utils/board_hierarchy';
import i18n from '../utils/i18n';
import app_state from '../utils/app_state';
import persistence from '../utils/persistence';
import { computed } from '@ember/object';
import progress_tracker from '../utils/progress_tracker';
import stashes from '../utils/_stashes';

export default modal.ModalController.extend({
  opening: function() {
    var _this = this;
    _this.set('switch_status', null);
    _this.set('default_language', true);
    _this.set('hierarchy', {loading: true});
    var board = this.get('model.board');
    var loadHierarchy = function() {
      BoardHierarchy.load_with_button_set(board, {deselect_on_different: true, prevent_different: true}).then(function(hierarchy) {
        _this.set('hierarchy', hierarchy);
      }, function() {
        _this.set('hierarchy', {error: true});
      });
    };
    if (board && board.reload) {
      board.reload(true).then(loadHierarchy, loadHierarchy);
    } else {
      loadHierarchy();
    }
  },
  locales: computed(function() {
    var list = i18n.get('translatable_locales');
    var res = [{name: i18n.t('choose_locale', '[Choose a Language]'), id: ''}];
    for(var key in list) {

      res.push({name: list[key], id: key});
    }
    res.push({name: i18n.t('unspecified', "Unspecified"), id: ''});
    return res;
  }),
  existing_default_language: computed('default_language', 'translate_locale', 'model.board.locales', function() {
    var loc = this.get('translate_locale');
    var list = this.get('model.board.locales') || [];
    return this.get('default_language') && list.indexOf(loc) != -1;
  }),
  is_source_language: computed('translate_locale', 'model.board.locale', 'model.board.translations', function() {
    var loc = this.get('translate_locale');
    if(!loc) { return false; }
    var board = this.get('model.board');
    var trans = (board && board.get && board.get('translations')) || {};
    var source = trans.default || (board && board.get && board.get('locale')) || 'en';
    var locRoot = loc.split(/-|_/)[0];
    var sourceRoot = String(source).split(/-|_/)[0];
    return loc === source || locRoot === sourceRoot;
  }),
  can_start_translation: computed('translate_locale', 'existing_default_language', 'is_source_language', 'hierarchy.loading', 'hierarchy.error', function() {
    var hierarchy = this.get('hierarchy');
    if (hierarchy && (hierarchy.loading || hierarchy.error)) { return false; }
    return !!this.get('translate_locale') && !this.get('existing_default_language') && !this.get('is_source_language');
  }),
  not_ready: computed('can_start_translation', function() {
    return !this.get('can_start_translation');
  }),
  can_edit_board: computed('model.board.permissions.edit', function() {
    var board = this.get('model.board');
    if (!board) { return false; }
    if (board.get && board.get('permissions.edit')) { return true; }
    return !!(board.permissions && board.permissions.edit);
  }),
  source_language_name: computed('translate_locale', 'model.board.locale', 'model.board.translations', function() {
    var board = this.get('model.board');
    var trans = (board && board.get && board.get('translations')) || {};
    var source = trans.default || (board && board.get && board.get('locale')) || 'en';
    return i18n.readable_language(this.get('translate_locale') || source);
  }),
  done_translating: function(new_default) {
    var _this = this;
    return _this.get('model.board').reload(true).then(function() {
      if(new_default) {
        var new_locale = _this.get('model.board.locale');
        /* Update the session locale whenever the user explicitly set
           this language as the board's default — works in speak mode
           AND in board-detail edit. The prior implementation gated
           the locale switch on `currentBoardState.id == board.id`,
           which only holds in speak mode (currentBoardState is null
           or different in edit), so editing the board after a
           translation showed stale English labels until you
           navigated away. */
        app_state.set('label_locale', new_locale);
        app_state.set('vocalization_locale', new_locale);
        stashes.persist('label_locale', new_locale);
        stashes.persist('vocalization_locale', new_locale);
        if(app_state.get('currentBoardState.id') == _this.get('model.board.id')) {
          app_state.set('currentBoardState.default_locale', new_locale);
        }
      }
      app_state.set('board_reload_key', Math.random() + "-" + (new Date()).getTime());
    });
  },
  actions: {
    switch_language: function() {
      var _this = this;
      if (!this.get('can_edit_board')) {
        modal.flash(i18n.t('board_translate_edit_permission_required', "You need editing permission for this board before you can translate it."), 'error');
        return;
      }
      _this.set('switch_status', {pending: true});
      var board_ids_to_include = null;
      if(this.get('hierarchy') && this.get('hierarchy').selected_board_ids) {
        board_ids_to_include = this.get('hierarchy').selected_board_ids();
      }
      var board = this.get('model.board');
      var trans = (board && board.get && board.get('translations')) || {};
      var source_locale = trans.default || (board && board.get && board.get('locale')) || 'en';

      persistence.ajax('/api/v1/boards/' + _this.get('model.board.id') + '/translate', {
        type: 'POST',
        contentType: 'application/json',
        dataType: 'json',
        data: JSON.stringify({
          source_lang: source_locale,
          destination_lang: _this.get('translate_locale'),
          set_as_default: true,
          fallbacks: 'true',
          force_update_default: true,
          translations: {},
          board_ids_to_translate: board_ids_to_include && board_ids_to_include.toArray ? board_ids_to_include.toArray() : board_ids_to_include
        })
      }).then(function(res) {
        app_state.set('board_translate_in_progress', true);
        modal.flash(i18n.t('switching_language', "Switching Language..."), 'notice', false, true);
        var track_id = null;
        track_id = progress_tracker.track(res.progress, function(event) {
          if(progress_tracker.is_terminal(event)) {
            app_state.set('board_translate_in_progress', false);
            modal.close('flash');
            progress_tracker.untrack(track_id);
          }
          if(progress_tracker.is_errored(event) || (progress_tracker.is_finished(event) && event.result && event.result.translated === false)) {
            _this.set('switch_status', {error: true});
          } else if(progress_tracker.is_finished(event)) {
            _this.set('switch_status', null);
            _this.done_translating(true);
            modal.close({switched: true});
          }
        });
      }, function(res) {
        _this.set('switch_status', {error: true});
      });
    },
    translate: function(switch_if_possible) {
      var _this = this;
      var board_ids_to_include = null;
      if(this.get('hierarchy') && this.get('hierarchy').selected_board_ids) {
        board_ids_to_include = this.get('hierarchy').selected_board_ids();
      }

      /* When the user is RE-translating (target locale is already the
         board's current locale), the server's translate_set normally
         forces `set_as_default_here = false` because source == dest
         — which silently stores the new translations in the cache
         without ever applying them to the visible button labels. The
         Re-Translate button only renders when `existing_default_language`
         is true, so use that flag as the signal to ask the server to
         honor `set_as_default` regardless of locale match. */
      var force_update = false;

      var translate_opts = {
        board: _this.get('model.board'),
        copy: _this.get('model.board'),
        button_set: (_this.get('hierarchy') && _this.get('hierarchy.button_set')) || _this.get('model.board.button_set'),
        locale: _this.get('translate_locale'),
        default_language: _this.get('default_language'),
        force_update_default: force_update,
        old_board_ids_to_translate: board_ids_to_include,
        new_board_ids_to_translate: board_ids_to_include,
      };

      return modal.open('button-set', translate_opts).then(function(res) {
        if(res && res.translated) {
          return _this.done_translating(translate_opts.default_language).then(function() {
            modal.close({translated: true});
            modal.flash(i18n.t('translations_applied', "Translations applied."), 'notice');
          });
        }
      });
    },
  }
});
