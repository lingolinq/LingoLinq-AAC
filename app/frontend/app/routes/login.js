import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';
import session from '../utils/session';

export default Route.extend({
  router: service('router'),
  appState: service('app-state'),
  title: "Login",
  beforeModel: function(transition) {
    if(this.appState.get('feature_flags.landing_beta_closed')) {
      // Allow device activation to complete even when public login is closed
      if(!(transition && transition.to && transition.to.name === 'login.device')) {
        this.appState.return_to_index();
        return;
      }
    }
    // Allow staying on login.device to complete device activation (Trust / Shared device)
    if(transition && transition.to && transition.to.name === 'login.device') {
      return;
    }
    // If user is authenticated and has a valid token, redirect away from login
    // If token is invalid, allow them to stay on login to re-authenticate
    if(session.get('isAuthenticated') && session.get('access_token')) {
      // Don't redirect if token is known to be invalid
      // This allows users with expired/invalid tokens to re-authenticate
      if(!session.get('invalid_token')) {
        this.router.transitionTo('index');
      }
    }
  },
  setupController: function(controller) {
    var searchParams = new URLSearchParams(window.location.search || '');
    controller.set('login_id', "");
    controller.set('login_password', "");
    controller.set('tmp_token', null);
    controller.set('google_link_nonce', null);
    controller.set('google_error', null);
    controller.set('google_popout_id', null);
    if(location.search && location.search.match(/^\?model-/)) {
      var parts = decodeURIComponent(location.search.replace(/^\?/, '')).split(/:/);
      if(parts[0] && parts[1]) {
        controller.set('login_id', parts[0].replace(/-/, '@').replace(/_/, '.'));
        controller.set('login_password', parts[1].replace(/-/, '?:#'));
        history.replaceState({}, null, "/login");
      }
    } else if(location.search && location.search.match(/^\?auth-/)) {
      var authParts = location.search.replace(/^\?auth-/, '').split(/_/);
      var tmpToken = authParts.shift();
      var userName = authParts.join('_');
      controller.set('login_id', userName);
      controller.set('tmp_token', tmpToken);
      history.replaceState({}, null, "/login");
    } else {
      var googleLink = searchParams.get('google_link');
      var googleError = searchParams.get('google_error');
      var googlePopout = searchParams.get('google_popout');
      if(googleLink) {
        controller.set('google_link_nonce', googleLink);
        try { sessionStorage.setItem('google_link_nonce', googleLink); } catch (e) { /* ignore */ }
        history.replaceState({}, null, "/login");
      } else if(googleError) {
        controller.set('google_error', googleError);
        try { sessionStorage.removeItem('google_link_nonce'); } catch (e) { /* ignore */ }
        history.replaceState({}, null, "/login");
      } else if(googlePopout) {
        controller.set('google_popout_id', googlePopout);
        history.replaceState({}, null, "/login");
      } else {
        try {
          var storedNonce = sessionStorage.getItem('google_link_nonce');
          if(storedNonce) {
            controller.set('google_link_nonce', storedNonce);
          }
        } catch (e) { /* ignore */ }
      }
    }
  }
});
