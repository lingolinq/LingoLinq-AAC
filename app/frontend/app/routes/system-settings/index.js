import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default Route.extend({
  router: service('router'),

  redirect() {
    this.router.transitionTo('system-settings.emails');
  }
});
