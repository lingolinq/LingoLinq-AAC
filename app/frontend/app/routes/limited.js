import Route from '@ember/routing/route';
import app_state from '../utils/app_state';

export default Route.extend({
  setupController: function(controller, model) {
    app_state.set('super_no_linky', true);
    app_state.set('no_linky', true);
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
