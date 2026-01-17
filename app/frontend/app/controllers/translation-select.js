import modal from '../utils/modal';
import BoardHierarchy from '../utils/board_hierarchy';
import i18n from '../utils/i18n';
import app_state from '../utils/app_state';
import persistence from '../utils/persistence';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';
import progress_tracker from '../utils/progress_tracker';

export default modal.ModalController.extend({
  appState: service('app-state'),
  persistence: service(),
  modal: service(),

  opening: function() {
    var _this = this;
    _this.set('switch_status', {pending: true});
    _this.set('default_language', true);
    _this.set('hierarchy', {loading: true});
    BoardHierarchy.load_with_button_set(this.get('model.board'), {deselect_on_different: true, prevent_different: true}).then(function(hierarchy) {
      _this.set('hierarchy', hierarchy);
    }, function(err) {
      _this.set('hierarchy', {error: true});
    });
    
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
  done_translating: function(new_default) {
    var _this = this;
    return _this.get('model.board').reload(true).then(function() {
      if(new_default && this.appState.get('currentBoardState.id') == _this.get('model.board.id')) {
        this.appState.set('currentBoardState.default_locale', _this.get('model.board.locale'));
        this.appState.set('label_locale', _this.get('model.board.locale'));
        this.appState.set('vocalization_locale', _this.get('model.board.locale'));
      }
      this.appState.set('board_reload_key', Math.random() + "-" + (new Date()).getTime());
    });
  },
  actions: {
    switch_language: function() {
      var _this = this;
      _this.set('switch_status', {pending: true});
      var loc = this.get('translate_locale');
      var board_ids_to_include = null;
      if(this.get('hierarchy') && this.get('hierarchy').selected_board_ids) {
        board_ids_to_include = this.get('hierarchy').selected_board_ids();
      }

      this.persistence.ajax('/api/v1/boards/' + _this.get('model.board.id') + '/translate', {
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
          if(event.status == 'errored' || (event.status == 'finished' && event.result && event.result.translated === false)) {
            _this.set('switch_status', {error: true});
          } else if(event.status == 'finished') {
            _this.set('switch_status', null);
            _this.done_translating(true);
            this.modal.close({translated: true});
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

      var translate_opts = {
        board: _this.get('model.board'),
        copy: _this.get('model.board'),
        button_set: _this.get('model.board.button_set'),
        locale: _this.get('translate_locale'),
        default_language: _this.get('default_language'),
        old_board_ids_to_translate: board_ids_to_include,
        new_board_ids_to_translate: board_ids_to_include,
      };

      return this.modal.open('button-set', translate_opts).then(function(res) {
        if(res && res.translated) {
          _this.done_translating(translate_opts.default_language);
        }
      });
    },
  }
});
