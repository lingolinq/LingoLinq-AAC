import Route from '@ember/routing/route';
import app_state from '../utils/app_state';
import i18n from '../utils/i18n';

export default Route.extend({
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
    controller.set('searchString', this.get('queryString'));
    controller.load_results(this.get('q') || '');
    app_state.set('hide_search', true);
  }
});
