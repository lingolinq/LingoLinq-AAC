import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default Route.extend({
  router: service(),
  store: service(),

  // Board creation is consolidated on the create-board-new page; the legacy
  // /create-board route now redirects there so every entry point lands on the
  // same flow.
  beforeModel() {
    this._super(...arguments);
    this.router.transitionTo('create-board-new');
  },

  activate() {
    this._super(...arguments);
    window.scrollTo(0, 0);
  },

  actions: {
    error() {
      var _this = this;
      this.store.findRecord('user', 'self').then(function(u) {
        _this.router.transitionTo('user.home', u.get('user_name'));
      }, function() {
        _this.router.transitionTo('index');
      });
      return false;
    }
  }
});
