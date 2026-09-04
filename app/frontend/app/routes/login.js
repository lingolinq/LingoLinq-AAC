import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';
import session from '../utils/session';

export default Route.extend({
  router: service('router'),
  title: "Login",
  beforeModel: function(transition) {
    // Allow staying on login.device to complete device activation (Trust / Shared device)
    if(transition && transition.to && transition.to.name === 'login.device') {
      return;
    }
    // Redirect away from the sign-in page ONLY when this session has been POSITIVELY
    // validated against the server in the current runtime.
    //
    // `isAuthenticated` + `access_token` only mean a token is STORED, and `user_name` is
    // restored from the stash too — none of them says the server still ACCEPTS it. That is
    // known only once check_token() answers, which is async and typically has not returned
    // when this hook runs.
    //
    // Redirecting on the stored token alone made a stale token UNRECOVERABLE: clicking
    // "Sign In" bounced to index, index showed the "Preparing your workspace" loading state
    // while it resolved, the token check then failed, and the user was dropped back on the
    // landing page — with no way to reach the form and re-authenticate. Gating on
    // `token_validated` (runtime-only, set by check_token) keeps the original intent — a
    // genuinely signed-in user does not sit on the sign-in page — while a user whose token
    // has gone stale gets the form IMMEDIATELY, with no loading screen in between.
    if(session.get('isAuthenticated') && session.get('access_token') &&
       !session.get('invalid_token') && session.get('token_validated')) {
      this.router.transitionTo('index');
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
