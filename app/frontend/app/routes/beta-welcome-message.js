import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';
import config from '../config/environment';

export default Route.extend({
  router: service(),
  session: service('session'),
  appState: service('app-state'),
  store: service('store'),
  betaWelcomeMode: service('beta-welcome-mode'),
  beforeModel() {
    if (!this.session.get('isAuthenticated') && config.environment !== 'development') {
      this.router.transitionTo('login');
      return;
    }
    if (this.session.get('isAuthenticated')) {
      var user = this.appState.get('currentUser') || this.store.peekRecord('user', 'self');
      if (user && !user.get('preferences.beta_program_access')) {
        this.appState.return_to_index();
      }
    }
  },
  activate() {
    this._super(...arguments);
    this.appState.controller.set('hide_header_force', true);
  },
  deactivate() {
    this._super(...arguments);
    this.appState.controller.set('hide_header_force', false);
  },
  setupController(controller) {
    this._super(...arguments);
    var user = this.appState.get('currentUser') || this.store.peekRecord('user', 'self');
    /* `display_name` already resolves the server's "No name" placeholder to the
       handle (models/user.js), so this only has to cover a missing record. */
    var name = user && user.get('display_name');
    controller.set('displayName', (name || '').trim());
    controller.set('agreementAccepted', false);
  },
  actions: {
    // Original layout: advance to the full agreement page.
    goToAgreement() {
      this.router.transitionTo('beta-welcome');
    },
    // Short layout: the Get Started button lives on this page. Records
    // acceptance and enters the app via the shared flow.
    acceptAgreement() {
      var controller = this.get('controller');
      if (!controller.get('agreementAccepted')) { return; }
      this.betaWelcomeMode.acceptAndFinish();
    }
  }
});
