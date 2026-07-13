import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { alias } from '@ember/object/computed';


export default Component.extend({
  appState: service('app-state'),
  // Alias for template compatibility (template uses this.app_state)
  app_state: alias('appState'),
});
