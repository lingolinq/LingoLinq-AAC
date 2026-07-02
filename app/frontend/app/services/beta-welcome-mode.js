import Service, { inject as service } from '@ember/service';
import { later, cancel } from '@ember/runloop';

// If the accept PUT never settles (network hang with no rejection), release the
// re-entrancy guard after this long so "Get Started" can be retried without a
// full page reload.
const FINISH_GUARD_TIMEOUT = 15000;

// Preview toggle shared by the beta-welcome-message and beta-welcome pages.
//   short === false  -> Original layout (the pre-2026-07-01 onboarding)
//   short === true   -> Short layout (this session's condensed onboarding)
// Kept on a service (not a controller) so the choice stays consistent while the
// user navigates between the two pages. It resets to Original on a fresh page
// load because the service is re-created, satisfying "default to Original".
export default Service.extend({
  router: service(),
  session: service('session'),
  persistence: service('persistence'),
  appState: service('app-state'),

  short: false,

  // Shared "record beta agreement acceptance and enter the app" flow. Used by
  // whichever page hosts the Get Started button — beta-welcome in Original mode,
  // beta-welcome-message in Short mode — so the behavior is identical in both.
  acceptAndFinish() {
    // Re-entrancy guard: a rapid double-tap on "Get Started" (common for AAC
    // users) would otherwise fire two PUTs and two return_to_index calls. On the
    // normal path both the success and failure handlers navigate into the app, so
    // the flag is naturally moot; the timer below is only a safety valve for a PUT
    // that hangs without ever settling (see FINISH_GUARD_TIMEOUT).
    if (this.get('finishing')) { return; }
    if (!this.session.get('isAuthenticated')) {
      this.router.transitionTo('login');
      return;
    }
    this.set('finishing', true);
    var _this = this;
    var guardTimer = later(function() {
      if (!_this.isDestroyed && !_this.isDestroying) { _this.set('finishing', false); }
    }, FINISH_GUARD_TIMEOUT);
    var finish = function() {
      cancel(guardTimer);
      try {
        sessionStorage.setItem('ll_auto_open_home_tour', '1');
      } catch (e) { /* sessionStorage unavailable */ }
      _this.appState.set('auto_open_home_tour', true);
      _this.appState.return_to_index();
    };
    this.persistence.ajax('/api/v1/users/self', {
      type: 'PUT',
      data: { user: { preferences: { beta_agreement_accepted: true } } }
    }).then(finish, finish);
  }
});
