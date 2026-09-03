import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import AuthenticatedView from './authenticated-view';
import modal from '../../utils/modal';
import i18n from '../../utils/i18n';
import { resolveSuperviseeHomeBoardKey } from '../../utils/supervisee_home_board';

/**
 * Classic home page.
 *
 * Rendered INSTEAD of <Dashboard::AuthenticatedView> when the signed-in user's
 * `preferences.board_view_style` is 'classic' — the same preference the board
 * Classic/Modern toggle already drives (components/board-actions.hbs, and
 * utils/board_view.js for the board route). One setting, board and home page.
 *
 * WHY IT EXTENDS THE MODERN COMPONENT
 * The classic page needs the same DATA the modern dashboard already loads and
 * the same ACTIONS it already exposes — sync state, blank-slate progress, the
 * install-reminder `device` hash, recent logs, the four board-browse lists, and
 * ~14 actions (sync / newBoard / intro / load_reports / set_selected / …). All
 * of that was ported and modernized once, in authenticated-view.js. Extending it
 * reuses that single implementation rather than keeping a second, drifting copy,
 * and — critically — requires NO edit to authenticated-view.js, so the modern
 * dashboard is untouched.
 *
 * This is safe because the parent's lifecycle is DOM-free: its `init` only wires
 * closures and calls `_loadPreviewBoards`, and its `didInsertElement` only calls
 * `_loadPreviewBoards` (authenticated-view.js:283-331). Nothing there queries the
 * `md-*` DOM this template does not render. If a DOM-dependent `didRender` is ever
 * added to the parent, it must be guarded — that is the one coupling to watch.
 *
 * Ember merges the `actions` hash down the prototype chain, so every parent action
 * stays reachable from this template and the three overridden below win.
 *
 * `templates/index.hbs` hosts both views, which covers BOTH home surfaces at once:
 * `/` (index) and `/:user_name/home` (user.home reuses index's template and
 * controller — see routes/user/home.js).
 */
export default AuthenticatedView.extend({
  router: service('router'),
  // The parent does not inject the session service (it has no re-login card), but
  // the classic status card leads with `session.invalid_token` — without this the
  // {{#if}} would silently read undefined and that state could never render.
  session: service('session'),

  // The parent wires per-action closures (this.onGoTab, …) rather than a generic
  // dispatcher, so this template gets the repo's standard `ctrlAction` helper —
  // the same one board-actions.js / supervision-settings.js define. Added on top
  // of the parent's init, never in place of it.
  init() {
    this._super(...arguments);
    var self = this;
    this.ctrlAction = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function() {
        var args = bound.concat(Array.prototype.slice.call(arguments));
        var evt = args[args.length - 1];
        if (evt && typeof evt.preventDefault === 'function' && (evt.type || evt.target)) {
          if (evt.preventDefault) { evt.preventDefault(); }
          args.pop();
        }
        self.send.apply(self, [actionName].concat(args));
      };
    };
  },

  // The parent defines `update_selected` and `checkForBlankSlate` as OBSERVERS
  // ('selected' / 'persistence.online'), and observers do not run on init. The
  // modern template never reads what they produce (`current_boards`,
  // `*_selected`, `showOffline`) — verified: 0 references in
  // authenticated-view.hbs — so they are dormant there and the gap went unnoticed.
  // The classic boards column DOES read them, so kick both once on insert or the
  // column renders permanently empty with no tab appearing selected.
  // `checkForBlankSlate` runs too: `update_selected` returns early when offline,
  // and that is exactly the case that needs `showOffline` + recent boards set.
  didInsertElement() {
    this._super(...arguments);
    try { this.update_selected(); } catch (e) { /* board list stays empty */ }
    try { this.checkForBlankSlate(); } catch (e) { /* offline list stays empty */ }
  },

  // NOTE: deliberately NOT named `user`. index.hbs passes `@user={{this.user}}`,
  // which on the index controller is the blank `createRecord('user')` used by the
  // registration form (routes/index.js#setupController) — a passed argument
  // overrides a class-defined property, so a computed named `user` here would be
  // silently replaced by that empty record and the rail would render a blank name.
  classicUser: computed('appState.currentUser', function() {
    return this.appState.get('currentUser');
  }),

  // Which supervisee's action menu is open, by id. One at a time — opening a
  // second closes the first, which is what a menu strip should do.
  openSuperviseeId: null,

  // `known_supervisees` entries are raw payload objects, so decorate each with the
  // facts the menu gates on. `resolved_home_board_key` uses the SAME resolver the
  // caseload page uses (utils/supervisee_home_board.js): reading `home_board_key`
  // alone — as the 2020 template did — misses three other shapes the payload can
  // use, which would wrongly grey out Model/Speak for a supervisee who has a board.
  decoratedSupervisees: computed('appState.currentUser.known_supervisees', function() {
    var list = this.appState.get('currentUser.known_supervisees') || [];
    return list.map(function(s) {
      var copy = Object.assign({}, s);
      copy.resolved_home_board_key = resolveSuperviseeHomeBoardKey(s);
      return copy;
    });
  }),

  // Home board lives on preferences.  // Home board lives on preferences. `home_board_pending` covers the window where
  // a board was picked and is still being copied server-side, which must NOT read
  // as "no home board yet" — that would send the user back to the picker mid-copy.
  homeBoardKey: computed('appState.currentUser.preferences.home_board.key', function() {
    return this.appState.get('currentUser.preferences.home_board.key');
  }),

  homeBoardPending: computed('homeBoardKey', 'appState.currentUser.home_board_pending', function() {
    return !this.get('homeBoardKey') && !!this.appState.get('currentUser.home_board_pending');
  }),

  supervisorCount: computed('appState.currentUser.supervisors', function() {
    return (this.appState.get('currentUser.supervisors') || []).length;
  }),

  hasSupervisors: computed('supervisorCount', function() {
    return this.get('supervisorCount') > 0;
  }),

  loggingEnabled: computed('appState.currentUser.preferences.logging', function() {
    return !!this.appState.get('currentUser.preferences.logging');
  }),

  // Logging can be on WITHOUT geo-tracking, which the classic status line has
  // always distinguished ("enabled (no geo)").
  loggingWithGeo: computed('loggingEnabled', 'appState.currentUser.preferences.geo_logging', function() {
    return !!(this.get('loggingEnabled') && this.appState.get('currentUser.preferences.geo_logging'));
  }),

  // The guided tour is feature-flagged and lives in the navbar (<GuidedTour />,
  // mounted by app-navbar-authenticated-inner on the same `empty_header` gate the
  // home page satisfies). Hide the row rather than offer a button that can't fire.
  tourAvailable: computed('appState.feature_flags.home_tour', function() {
    return !!this.appState.get('feature_flags.home_tour');
  }),

  // Sessions only mean something once logging is on; the classic Recent Sessions
  // block otherwise explains itself instead of showing an empty list.
  showSessionList: computed('loggingEnabled', 'logs', function() {
    return this.get('loggingEnabled') || !!(this.get('logs') || {}).length;
  }),

  actions: {
    // Same signal the navbar trigger and the parent's `intro` action use:
    // guided-tour.js observes `auto_open_home_tour` and starts the tour for the
    // current route + layout. Deliberately NOT a direct call into the tour
    // component, so there is one entry point rather than two.
    start_tour: function() {
      this.appState.set('auto_open_home_tour', true);
    },

    // OVERRIDE. The parent switches an inline dashboard tab (`activeTab`), which
    // this template has no tab strip for; the classic page has always opened the
    // Supervision settings modal instead (ef72e6147^:controllers/index.js:504).
    manage_supervisors: function() {
      modal.open('supervision-settings', {user: this.appState.get('currentUser')});
    },

    // OVERRIDE. The parent flips `new_index`, the long-dead 2020 dashboard toggle
    // (inert since ef72e6147 — application.js#content_class emits "new_index"
    // unconditionally). Here it must flip the preference that actually drives THIS
    // page, otherwise the classic user has no way back to modern from the home
    // page at all — they would have to open a board and use its actions menu.
    new_dashboard: function() {
      var user = this.appState.get('currentUser');
      if(!user) { return; }
      user.set('preferences.board_view_style', 'modern');
      user.save().then(null, function() { });
      modal.success(i18n.t('switched_to_card_view', "Switched to Card View. You can go back to Classic any time from the View menu."));
    },

    // The parent exposes `autoOpenSpeakMode` as a get/set computed that persists on
    // set; drive it from a plain checkbox rather than a two-way <Input> binding.
    //
    // Flips the CURRENT VALUE rather than reading `event.target.checked`, because
    // this handler never sees the event: `ctrlAction` above pops a trailing DOM event
    // off the argument list before dispatching, and this is the one call site that
    // passes the event and nothing else. Reading it yielded `undefined` on every
    // click, so `!!(undefined && …)` wrote `false` every time and the box could only
    // ever be turned OFF. The input's `checked` attribute is bound to this same
    // property (classic-view.hbs:140), so toggling it keeps the DOM in step.
    toggle_auto_speak: function() {
      this.set('autoOpenSpeakMode', !this.get('autoOpenSpeakMode'));
    },

    // Menu open/close. Toggling the already-open one closes it.
    toggle_supervisee_menu: function(id) {
      this.set('openSuperviseeId', this.get('openSuperviseeId') === id ? null : id);
    },

    // Mirrors controllers/caseload.js#caseload_set_home_board: a supervisee with no
    // board is sent to the standalone picker FOR THAT USER, after confirming the
    // supervisor actually holds edit/supervise permission on them. Modeling-only
    // links cannot set a board at all, so they never reach here (the template gates
    // the entry the same way the caseload row does).
    set_supervisee_home_board: function(supervisee) {
      var _this = this;
      if(!supervisee || supervisee.modeling_only) { return; }
      var rawId = supervisee.id != null ? supervisee.id : supervisee.user_id;
      if(rawId == null) { return; }
      this.get('store').findRecord('user', rawId).then(function(user_model) {
        if(!user_model.get('permissions.edit') && !user_model.get('permissions.supervise')) {
          modal.error(i18n.t('not_allowed_user_long', "It appears you don't have permission to access this user's information"));
          return;
        }
        _this.get('router').transitionTo('board-picker', {queryParams: {user_id: user_model.get('id')}});
      }, function() {
        modal.error(i18n.t('error_loading_user2', "There was an unexpected error trying to load the user"));
      });
    },

    // Notifications + recent sessions, reachable once logging is producing them.
    load_sessions: function() {
      var user_name = this.appState.get('currentUser.user_name');
      if(!user_name) { return; }
      this.get('router').transitionTo('user.logs', user_name);
    }
  }
});
