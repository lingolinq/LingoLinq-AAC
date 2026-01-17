import BoardHierarchy from '../../utils/board_hierarchy';
import modal from '../../utils/modal';
import i18n from '../../utils/i18n';
import stashes from '../../utils/_stashes';
import app_state from '../../utils/app_state';
import persistence from '../../utils/persistence';
import progress_tracker from '../../utils/progress_tracker';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

export default modal.ModalController.extend({
  appState: service('app-state'),
  persistence: service(),
  modal: service(),

  opening: function() {
    var _this = this;
    _this.set('hierarchy', {loading: true});
    _this.set('status', null);
    BoardHierarchy.load_with_button_set(this.get('model.board'), {deselect_on_different: true, prevent_keyboard: true, prevent_different: true}).then(function(hierarchy) {
      _this.set('hierarchy', hierarchy);
    }, function(err) {
      _this.set('hierarchy', {error: true});
    });
  },
  langs: computed('model.board.locales', function() {
    var res = [];
    (this.get('model.board.locales') || []).forEach(function(loc) {
      res.push({loc: loc, keep: true, str: i18n.locales_localized[loc] || i18n.locales[loc]});
    });
    return res;
  }),
  actions: {
    confirm: function() {
      var _this = this;
      var board_ids_to_include = null;
      if(this.get('hierarchy') && this.get('hierarchy').selected_board_ids) {
        board_ids_to_include = this.get('hierarchy').selected_board_ids();
      }

      _this.set('status', {loading: true});
      var locales = [];
      _this.get('langs').forEach(function(lang) {
        if(lang.keep) { locales.push(lang.loc) }
      });
      if(locales.length == 0) { return; }
      this.persistence.ajax('/api/v1/boards/' + _this.get('model.board.id') + '/slice_locales', {
        type: 'POST',
        data: {
          locales: locales,
          ids_to_update: board_ids_to_include
        }
      }).then(function(res) {
        progress_tracker.track(res.progress, function(event) {
          if(event.status == 'errored') {
            _this.set('status', {error: true});
          } else if(event.status == 'finished') {
            _this.set('status', {finished: true});
            _this.get('model.board').reload(true).then(function() {
              this.appState.set('board_reload_key', Math.random() + "-" + (new Date()).getTime());
              this.modal.close('slice-locales');
            }, function() {
            });
          }
        });
      }, function(res) {
        _this.set('status', {error: true});
      });
    }
  }
});
