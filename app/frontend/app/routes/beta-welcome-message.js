import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';
import config from '../config/environment';

export default Route.extend({
  session: service('session'),
  appState: service('app-state'),
  beforeModel() {
    if (!this.session.get('isAuthenticated') && config.environment !== 'development') {
      this.transitionTo('login');
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
    var user = this.appState.get('currentUser');
    var name = user && (user.get('name') || user.get('user_name'));
    controller.set('displayName', (name || '').trim() || 'Friend');
  },
  actions: {
    goToAgreement() {
      this.transitionTo('beta-welcome');
    }
  }
});
