import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';
import RSVP from 'rsvp';
import session from '../utils/session';
import i18n from '../utils/i18n';

export default Route.extend({
  appState: service('app-state'),
  router: service(),
  store: service(),

  model() {
    var user = this.get('appState.sessionUser') || this.get('appState.currentUser');
    if (user) {
      return user;
    }
    if (session.get('access_token')) {
      return this.store.findRecord('user', 'self');
    }
    return null;
  },

  afterModel(model) {
    if (!model) {
      this.router.transitionTo('index');
      return RSVP.reject();
    }
    var supervisees = model.get('known_supervisees') || model.get('supervisees') || [];
    var canAccess = model.get('supporter_role') ||
      model.get('supporter_view') ||
      supervisees.length > 0;
    if (!canAccess) {
      this.router.transitionTo('index');
      return RSVP.reject();
    }
    model.set('load_all_connections', true);
  },

  titleToken() {
    return i18n.t('caseload_page_title', "My Caseload");
  }
});
