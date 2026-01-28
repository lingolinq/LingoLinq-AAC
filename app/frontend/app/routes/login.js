import Route from '@ember/routing/route';
import session from '../utils/session';

export default Route.extend({
  title: "Login",
  beforeModel: function(transition) {
    // If user is authenticated and has a valid token, redirect away from login
    // If token is invalid, allow them to stay on login to re-authenticate
    if(session.get('isAuthenticated') && session.get('access_token')) {
      // Don't redirect if token is known to be invalid
      // This allows users with expired/invalid tokens to re-authenticate
      if(!session.get('invalid_token')) {
        this.transitionTo('index');
      }
    }
  },
  setupController: function(controller) {
    controller.set('login_id', "");
    controller.set('login_password', "");
    if(location.search && location.search.match(/^\?model-/)) {
      var parts = decodeURIComponent(location.search.replace(/^\?/, '')).split(/:/);
      if(parts[0] && parts[1]) {
        controller.set('login_id', parts[0].replace(/-/, '@').replace(/_/, '.'));
        controller.set('login_password', parts[1].replace(/-/, '?:#'));
        history.replaceState({}, null, "/login");
      }
    } else if(location.search && location.search.match(/^\?auth-/)) {
      var parts = location.search.replace(/^\?auth-/, '').split(/_/);
      var un = parts[1];
      var tmp_token = parts[0];
      controller.set('login_id', un);
      controller.set('tmp_token', tmp_token);
      history.replaceState({}, null, "/login");
    }
  }
});
