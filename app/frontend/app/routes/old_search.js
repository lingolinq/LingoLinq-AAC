import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default Route.extend({
  router: service('router'),
  title: "Search",
  model: function(params) {
    var q = params.q;
    if(q == '_') { q = ''; }
    this.set('q', q);
    this.set('queryString', decodeURIComponent(q));
    return {};
  },
  setupController: function(controller) {
    var locale = (window.navigator.language || 'en').split(/-|_/)[0];
    this.router.transitionTo('search', locale, this.get('queryString'));
  }
});
