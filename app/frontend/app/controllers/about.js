import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { alias } from '@ember/object/computed';

export default Controller.extend({
  appState: service('app-state'),
  // Alias for template compatibility (template uses this.app_state)
  app_state: alias('appState'),
  /**
   * When true, shows the Photography attribution card at the end of the grid.
   * Leave false until splash or other credited photos are in use.
   */
  showPhotographyAttribution: false,
});
