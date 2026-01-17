import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default Route.extend({
  appState: service('app-state'),
  setupController: function(controller, model) {
    this.appState.set('super_no_linky', true);
    this.appState.set('no_linky', true);
    if(location.href.match(/support/)) {
      controller.transitionToRoute('contact');
    } else if(location.href.match(/privacy/)) {
      controller.transitionToRoute('privacy');
    } else if(location.href.match(/terms/)) {
      controller.transitionToRoute('terms');
    } else {
      controller.transitionToRoute('index');
    }
  }
});
