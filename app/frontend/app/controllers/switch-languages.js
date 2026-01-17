import modal from '../utils/modal';
import app_state from '../utils/app_state';
import stashes from '../utils/_stashes';
import { set as emberSet, get as emberGet } from '@ember/object';
import { inject as service } from '@ember/service';
import i18n from '../utils/i18n';
import { observer } from '@ember/object';
import { computed } from '@ember/object';

export default modal.ModalController.extend({
  appState: service('app-state'),
  stashes: service(),
  modal: service(),

  opening: function() {
    var labels = this.appState.get('label_locale') || this.get('model.board.translations.current_label') || this.get('model.board.locale') || 'en';
    var vocalizations = this.appState.get('vocalization_locale') || this.get('model.board.translations.current_vocalization') || this.get('model.board.locale') || 'en';
    this.set('label_locale', labels);
    this.set('vocalization_locale', vocalizations);
    if(labels == vocalizations) { this.set('same_locale', true); }
  },
  update_matching_other: observer(
    'label_locale',
    'vocalization_locale',
    'locales',
    function(stuff, change) {
      if(change == 'vocalization_locale' && this.get('same_locale')) {
        this.set('label_locale', this.get('vocalization_locale'));
      }
      var _this = this;
      this.get('locales').forEach(function(l) {
        if(emberGet(l, 'id') == _this.get('vocalization_locale')) {
          emberSet(l, 'vocalization_locale', true);
        } else if(emberGet(l, 'vocalization_locale')) {
          emberSet(l, 'vocalization_locale', false);
        }
        if(emberGet(l, 'id') == _this.get('label_locale')) {
          emberSet(l, 'label_locale', true);
        } else if(emberGet(l, 'label_locale')) {
          emberSet(l, 'label_locale', false);
        }
      });
    }
  ),
  two_languages: computed('locales', function() {
    return this.get('locales.length') == 2;
  }),
  locales: computed('model.board', 'model.board.locales', function() {
    var root_locales = {};
    var locales = this.get('model.board.locales') || [];
    var list = i18n.get('locales');
    var res = [];
    locales.forEach(function(l) {
      var root = l.split(/-|_/)[0];
      root_locales[root] = (root_locales[root] || 0) + 1;
    })
    for(var key in list) {
      if(locales.indexOf(key) != -1) {
        var root = key.split(/-|_/)[0];
        var name = list[key];
        // If there aren't multiple locales with the same
        // language, just use the language and the descriptor
        if(!root_locales[root] || root_locales[root] == 1 && list[root]) {
          name = list[root];
        }
        res.push({name: name, id: key});
      }
    }
    return res;
  }),
  actions: {
    set_locale: function(type, val) {
      this.set(type + '_locale', val);
    },
    set_languages: function() {
      this.appState.set('label_locale', this.get('label_locale'));
      this.stashes.persist('label_locale', this.get('label_locale'));
      this.appState.set('vocalization_locale', this.get('vocalization_locale'));
      this.stashes.persist('vocalization_locale', this.get('vocalization_locale'));
      this.stashes.persist('override_label_locale', this.get('label_locale'));
      this.stashes.persist('override_vocalization_locale', this.get('vocalization_locale'));
      this.modal.close({switched: true});
    },
    clear_languages: function() {
      this.appState.set('label_locale', this.get('model.board.locale'));
      this.stashes.persist('label_locale', null);
      this.appState.set('vocalization_locale', this.get('model.board.locale'));
      this.stashes.persist('vocalization_locale', null);
      this.stashes.persist('override_label_locale', null);
      this.stashes.persist('override_vocalization_locale', null);
      this.modal.close({switched: true});
    }
  }
});
