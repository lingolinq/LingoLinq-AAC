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
    var localeParam = params.locale || params.l;
    var locale;
    if (localeParam === 'any' || !localeParam) {
      // Default to user's language picker preference instead of "Any Language"
      var preferred = (i18n.langs || {}).preferred || window.navigator.language;
      var list = i18n.get('translatable_locales') || {};
      var normalized = (preferred || 'en').replace(/-/g, '_');
      if (list[normalized]) {
        locale = normalized;
      } else {
        var base = normalized.split(/_/)[0];
        locale = list[base] ? base : 'en';
      }
    } else {
      locale = localeParam;
    }
    this.set('locale', locale);
    this.set('_searchParams', params);
    return {};
  },
  afterModel: function(model, transition) {
    var params = this.get('_searchParams');
    if (params && (params.l === 'any' || !params.l) && this.get('locale') !== 'any') {
      this.replaceWith('search', this.get('locale'), params.q || '_');
    }
  },
  setupController: function(controller) {
    controller.set('model', {});
    controller.set('locale', this.get('locale'));
    controller.load_results(this.get('q'));
    controller.set('searchString', this.get('queryString'));
    this.appState.set('hide_search', true);
  }
});
