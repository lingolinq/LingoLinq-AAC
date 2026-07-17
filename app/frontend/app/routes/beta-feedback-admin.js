import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';
import RSVP from 'rsvp';

export default Route.extend({
  router: service('router'),
  store: service('store'),
  session: service('session'),

  beforeModel() {
    if (!this.get('session.isAuthenticated') || !this.get('session.access_token')) {
      this.router.transitionTo('login');
      return RSVP.resolve();
    }
    var _this = this;
    // Do not rely on appState.sessionUser here — it may not be set yet or may predate
    // the loaded user JSON. Load self from the store (same as dashboard) so `admin`
    // and permissions from GET /api/v1/users/self are present.
    return this.store.findRecord('user', 'self').then(function(user) {
      var permissions = user.get('permissions') || {};
      var isAdmin = !!user.get('admin') || !!permissions.admin_support_actions;
      if (!isAdmin) {
        _this.router.transitionTo('index');
      }
    }).catch(function() {
      _this.router.transitionTo('login');
    });
  }
});
