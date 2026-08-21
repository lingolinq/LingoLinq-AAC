import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';
import i18n from '../../utils/i18n';

export default Route.extend({
  appState: service('app-state'),

  model: function() {
    var user = this.modelFor('user');
    user.set('subroute_name', i18n.t('reports', 'reports'));
    return user;
  },

  /* The Reports hero offers "Select Communicator", which opens the
     switch-communicators modal. That modal's list is built from
     `sessionUser.known_supervisees`, and the user payload embeds only the FIRST
     TEN supervisees (lib/json_api/user.rb:224 — `supervisees[0, 10]`). A
     supporter with more than ten therefore could not reach the rest FROM THIS
     PAGE: they were simply absent from the picker. Arriving via Caseload worked
     only incidentally, because routes/caseload.js sets the same flag and the
     refetched list was still in memory.

     `load_all_connections` triggers models/user.js#load_more_supervision, which
     pages /api/v1/users/:id/supervisees and replaces the truncated list.

     Set on the SESSION user, not on `model` — here `model` is the communicator
     being reported ON, whereas caseload's model happens to BE the sessionUser.
     Setting it on `model` would look right and fix nothing. */
  afterModel: function() {
    var session_user = this.get('appState.sessionUser');
    if(session_user && session_user.get('supervisees.length') >= 10) {
      session_user.set('load_all_connections', true);
      /* RETURNED, not fire-and-forget. The only consumer (components/user-select.js)
         snapshots `known_supervisees` once in didInsertElement with no observer, so a
         supporter who opened the picker before these pages resolved got the truncated
         10 and it never repopulated — the exact bug this load exists to fix, failing
         intermittently and invisibly. models/user.js exposes the promise for this. */
      var p = session_user.get('all_connections_promise');
      if(p && p.then) { return p.then(null, function() { /* fall back to the 10 */ }); }
    }
  },
  resetController: function(controller, isExiting) {
    if(isExiting) {
      controller.reset_params();
    }
  },
  setupController: function(controller, model) {
    /* A subject change on this same route keeps the controller instance, and
       resetController only fires on isExiting — so the PREVIOUS communicator's
       device/location/snapshot/date filters rode along into the new report. Rails
       applies an unowned device_id without an ownership check (lib/stats.rb), so the
       new communicator's report rendered "no data" with a foreign device still in the
       filter chip: indistinguishable from genuine inactivity in a clinical report. */
    if(controller.get('model.id') && controller.get('model.id') !== model.get('id')) {
      controller.reset_params();
    }
    controller.set('model', model);
    if(model.get('preferences.logging')) {
      controller.load_charts();
      controller.load_core();
    }
    controller.load_snapshots();
  }
});
