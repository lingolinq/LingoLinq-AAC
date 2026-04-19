import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';
import i18n from '../utils/i18n';

export default Route.extend({
  appState: service('app-state'),

  model() {
    return this.get('appState.currentUser');
  },

  afterModel(model) {
    if (!model || !model.get('supporter_role')) {
      this.transitionTo('index');
    }
  },

  titleToken() {
    return i18n.t('caseload_page_title', "My Caseload");
  }
});
