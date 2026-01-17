import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default Route.extend({
  appState: service('app-state'),
  setupController: function(controller, model) {
    if(!this.appState.get('domain_settings.full_domain')) {
      controller.transitionToRoute('index');
      return;
    }
  },
  activate: function() {
    this._super();
    window.scrollTo(0, 0);
  }
});
