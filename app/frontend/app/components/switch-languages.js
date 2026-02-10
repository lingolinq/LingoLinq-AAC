import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { observer } from '@ember/object';
import { computed } from '@ember/object';
import modal from '../utils/modal';
import i18n from '../utils/i18n';

/**
 * Switch Languages modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  stashes: service('stashes'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'switch-languages';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
    const appState = this.get('appState');
    const labels = appState.get('label_locale') || this.get('model.board.translations.current_label') || this.get('model.board.locale') || 'en';
    const vocalizations = appState.get('vocalization_locale') || this.get('model.board.translations.current_vocalization') || this.get('model.board.locale') || 'en';
    this.set('label_locale', labels);
    this.set('vocalization_locale', vocalizations);
    this.set('same_locale', labels === vocalizations);
  },

  update_matching_other: observer('vocalization_locale', 'same_locale', function() {
    if (this.get('same_locale')) {
      this.set('label_locale', this.get('vocalization_locale'));
    }
  }),

  two_languages: computed('locales', function() {
    return (this.get('locales') || []).length === 2;
  }),

  locales: computed('model.board', 'model.board.locales', function() {
    const root_locales = {};
    const locales = this.get('model.board.locales') || [];
    const list = i18n.get('locales');
    const res = [];
    locales.forEach(function(l) {
      const root = l.split(/-|_/)[0];
      root_locales[root] = (root_locales[root] || 0) + 1;
    });
    for (const key in list) {
      if (locales.indexOf(key) !== -1) {
        const root = key.split(/-|_/)[0];
        let name = list[key];
        if (!root_locales[root] || (root_locales[root] === 1 && list[root])) {
          name = list[root];
        }
        res.push({ name: name, id: key });
      }
    }
    return res;
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    set_locale(type, val) {
      this.set(type + '_locale', val);
    },
    set_languages() {
      const appState = this.get('appState');
      const stashes = this.get('stashes');
      appState.set('label_locale', this.get('label_locale'));
      stashes.persist('label_locale', this.get('label_locale'));
      appState.set('vocalization_locale', this.get('vocalization_locale'));
      stashes.persist('vocalization_locale', this.get('vocalization_locale'));
      stashes.persist('override_label_locale', this.get('label_locale'));
      stashes.persist('override_vocalization_locale', this.get('vocalization_locale'));
      this.get('modal').close({ switched: true });
    },
    clear_languages() {
      const appState = this.get('appState');
      const stashes = this.get('stashes');
      const boardLocale = this.get('model.board.locale');
      appState.set('label_locale', boardLocale);
      stashes.persist('label_locale', null);
      appState.set('vocalization_locale', boardLocale);
      stashes.persist('vocalization_locale', null);
      stashes.persist('override_label_locale', null);
      stashes.persist('override_vocalization_locale', null);
      this.get('modal').close({ switched: true });
    }
  }
});
