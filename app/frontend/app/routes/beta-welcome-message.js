import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';
import config from '../config/environment';

export default Route.extend({
  router: service(),
  session: service('session'),
  appState: service('app-state'),
  store: service('store'),
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
    var name = user && (user.get('name') || user.get('user_name'));
    controller.set('displayName', (name || '').trim() || 'Friend');
  },
  actions: {
    goToAgreement() {
      this.router.transitionTo('beta-welcome');
    }
  }
});
