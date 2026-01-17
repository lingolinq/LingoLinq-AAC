import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';
import app_state from '../utils/app_state';

export default Route.extend({
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
    controller.transitionToRoute('search', locale, this.get('queryString'));
  }
});
