import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default Route.extend({
  router: service('router'),
  appState: service('app-state'),
  setupController: function(controller, model) {
    this.appState.set('super_no_linky', true);
    this.appState.set('no_linky', true);
    if(location.href.match(/support/)) {
      this.router.transitionTo('contact');
    } else if(location.href.match(/privacy/)) {
      this.router.transitionTo('privacy');
    } else if(location.href.match(/terms/)) {
      this.router.transitionTo('terms');
    } else {
      this.appState.return_to_index();
    }
  }
});
