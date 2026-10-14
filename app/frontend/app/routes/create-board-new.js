import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default Route.extend({
  router: service(),
  store: service(),
  appState: service('app-state'),

  /* RESOLVE THE VIEW STYLE BEFORE THE PAGE IS ENTERED, and hand it to the component as
     an argument rather than letting the component work it out for itself.

     WHY AT THE ROUTE. The component previously read `appState.effective_view_style`
     through a computed. That chain ends at `effective_view_user.preferences.board_view_style`,
     and `preferences` is a PLAIN OBJECT -- Ember cannot observe a mutation made INSIDE a
     POJO, so once that computed had been evaluated (potentially before the user record
     finished hydrating, when it answers "modern") nothing necessarily invalidated it
     again. `services/app-state.js#sync_view_scope` works around the same hazard by
     watching RAW preference paths instead of the computed, and its comment records that
     the body class was never stamped at all until it did.

     Resolving here removes the timing question entirely: the value is read once, on the
     way in, when `currentUser` is already settled, and every one of the seven entry points
     that transition to this route gets the same treatment for free because they all come
     through this hook. */
  setupController(controller, model) {
    this._super(...arguments);
    controller.set('entry_view_style', this.appState.get('effective_view_style'));
  },

  activate() {
    this._super(...arguments);
    window.scrollTo(0, 0);
    this.appState.controller.set('hide_header_force', true);
  },

  deactivate() {
    this.appState.controller.set('hide_header_force', false);
    // One-shot flag: the board-picker tour modal sets it before navigating here;
    // clear it on leave so a later, non-tour visit to create-board-new doesn't
    // read it as tour-originated.
    this.appState.set('from_tour_board_picker', false);
  },

  actions: {
    error() {
      var _this = this;
      this.store.findRecord('user', 'self').then(function(u) {
        _this.router.transitionTo('user.home', u.get('user_name'));
      }, function() {
        _this.router.transitionTo('index');
      });
      return false;
    }
  }
});
