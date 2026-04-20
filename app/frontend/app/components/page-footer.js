import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { alias } from '@ember/object/computed';

export default Component.extend({
  appState: service('app-state'),
  app_state: alias('appState'),

  actions: {
    support() {
      // Use closure action if provided, otherwise no-op (actions are handled in template)
      var action = this.get('support');
      if (action && typeof action === 'function') {
        action();
      }
    },
    language() {
      // Use closure action if provided, otherwise no-op (actions are handled in template)
      var action = this.get('language');
      if (action && typeof action === 'function') {
        action();
      }
    }
  }
});
