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
    }
  },
  resetController: function(controller, isExiting) {
    if(isExiting) {
      controller.reset_params();
    }
  },
  setupController: function(controller, model) {
    controller.set('model', model);
    if(model.get('preferences.logging')) {
      controller.load_charts();
      controller.load_core();
    }
    controller.load_snapshots();
  }
});
