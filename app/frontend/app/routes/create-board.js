import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default Route.extend({
  router: service(),
  store: service(),

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
