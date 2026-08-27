import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';
import RSVP from 'rsvp';
import session from '../utils/session';
import i18n from '../utils/i18n';

export default Route.extend({
  appState: service('app-state'),
  router: service(),
  store: service(),

  model() {
    var user = this.get('appState.sessionUser') || this.get('appState.currentUser');
    if (user) {
      return user;
    }
    if (session.get('access_token')) {
      return this.store.findRecord('user', 'self');
    }
    return null;
  },

  afterModel(model) {
    if (!model) {
      this.router.transitionTo('index');
      return RSVP.reject();
    }
    var supervisees = model.get('known_supervisees') || model.get('supervisees') || [];
    var canAccess = model.get('supporter_role') ||
      model.get('supporter_view') ||
      supervisees.length > 0;
    if (!canAccess) {
      this.router.transitionTo('index');
      return RSVP.reject();
    }
    model.set('load_all_connections', true);
  },

  /* This route had NO resetController, and the controller is a singleton — so the
     expanded row, its loaded badge, the per-user badge cache, the roster filter and the
     deep-link marker all survived leaving the page. On a shared clinic device that
     outlives a logout (services/session.js#clear_user_state clears app-state and
     persistence but touches no controller), which means the next supporter could open
     the caseload and see the previous one's expanded communicator and badge. */
  resetController: function(controller, isExiting) {
    this._super.apply(this, arguments);
    if (isExiting) {
      controller.set('supervisee', null);
      controller.set('_deepLinkAppliedFor', null);
      controller.set('selectedSupervisee', null);
      controller.set('highlightedSupervisee', null);
      controller.set('selectedBadge', null);
      controller.set('_superviseeBadges', null);
      controller.set('superviseeFilter', '');
    }
  },

  titleToken() {
    return i18n.t('caseload_page_title', "My Caseload");
  }
});
