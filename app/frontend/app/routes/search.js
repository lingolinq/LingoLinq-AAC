import Route from '@ember/routing/route';
import i18n from '../utils/i18n';
import { inject as service } from '@ember/service';

export default Route.extend({
  appState: service('app-state'),
  title: "Search",
  model: function(params) {
    var q = params.q;
    if(q == '_') { q = ''; }
    this.set('q', q);
    this.set('queryString', decodeURIComponent(q));
    this.set('locale', params.locale || params.l || (i18n.langs || {}).preferred || window.navigator.language);
    return {};
  },
  setupController: function(controller) {
    controller.set('model', {});
    controller.set('locale', this.get('locale'));
    controller.load_results(this.get('q'));
    controller.set('searchString', this.get('queryString'));
    this.appState.set('hide_search', true);
  }
});
