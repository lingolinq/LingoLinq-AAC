import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';
import config from '../config/environment';

export default Route.extend({
  router: service(),
  session: service('session'),
  persistence: service('persistence'),
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
    controller.set('agreementAccepted', false);
  },
  actions: {
    acceptAgreement() {
      var controller = this.get('controller');
      if (!controller.get('agreementAccepted')) { return; }
      if (!this.session.get('isAuthenticated')) {
        this.router.transitionTo('login');
        return;
      }
      this.persistence.ajax('/api/v1/users/self', {
        type: 'PUT',
        data: { user: { preferences: { beta_agreement_accepted: true } } }
      }).then(() => {
        try {
          sessionStorage.setItem('ll_auto_open_home_tour', '1');
        } catch (e) { /* sessionStorage unavailable */ }
        this.appState.set('auto_open_home_tour', true);
        this.appState.return_to_index();
      }, () => {
        try {
          sessionStorage.setItem('ll_auto_open_home_tour', '1');
        } catch (e) { /* sessionStorage unavailable */ }
        this.appState.set('auto_open_home_tour', true);
        this.appState.return_to_index();
      });
    }
  }
});
