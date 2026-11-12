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
    return this.store.findRecord('user', 'self').then(function(user) {
      _this._loadedUser = user;
      var permissions = user.get('permissions') || {};
      var isAdmin = !!user.get('admin') || !!permissions.admin_support_actions;
      if (!isAdmin) {
        _this.router.transitionTo('index');
      }
    }).catch(function() {
      _this.router.transitionTo('login');
    });
  },

  /* THE ORGANIZATION LIST, ON EVERY VISIT, FOR THE USER LOADED ABOVE (2026-11-09). The controller
     loaded it once, at creation, from `app_state.currentUser`, which on a direct load or a refresh
     is not hydrated yet, so the Organization select stayed empty until the next in-app visit. */
  setupController(controller) {
    this._super(...arguments);
    controller.loadOrganizations(this._loadedUser);
  }
});
