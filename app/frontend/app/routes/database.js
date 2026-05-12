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
      var permissions = user.get('permissions') || {};
      var isAdmin = !!user.get('admin') || !!permissions.admin_support_actions;
      if (!isAdmin) {
        _this.router.transitionTo('index');
      }
    }).catch(function() {
      _this.router.transitionTo('login');
    });
  },

  activate() {
    this._super(...arguments);
    if (window.scrollTo) {
      window.scrollTo(0, 0);
    }
  },

  setupController(controller) {
    this._super(...arguments);
    if (typeof controller.loadSchema === 'function') {
      controller.loadSchema();
    }
  }
});
