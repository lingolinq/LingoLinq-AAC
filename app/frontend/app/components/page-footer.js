import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { alias } from '@ember/object/computed';

export default Component.extend({
  appState: service('app-state'),
  app_state: alias('appState'),

  supportAction() {
    var action = this.get('support');
    if (action && typeof action === 'function') {
      action();
    }
  },
  languageAction() {
    var action = this.get('language');
    if (action && typeof action === 'function') {
      action();
    }
  }
});
