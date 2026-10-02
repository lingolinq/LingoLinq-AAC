import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import { is_classic, view_style, set_view_style, confirm_view_style_change } from '../utils/view_style';
import { board_view_route } from '../utils/board_view';
import { basic_landing_for, hand_off_index_nav, is_own_page, modern_landing_for } from '../utils/basic_landing';
import paint_view_switch_overlay from '../utils/view_switch_overlay';

/**
 * The navbar "View" dropdown — the app-wide Basic/Modern switch, plus the
 * Gentle/Focused style overlay.
 *
 * Each axis lists BOTH of its options with the active one checked, rather than
 * offering only the one you are not on. Picking a Layout writes
 * `preferences.board_view_style` (see utils/view_style.js for why that key) and
 * the whole app follows, because every basic-view surface branches on the same
 * preference. Selecting the option that is already active is a no-op beyond
 * closing the menu — no write, no save, and on a board no transition.
 *
 * MOST pages need no navigation after the switch: classic and modern render at
 * the SAME route and the template picks the variant, so flipping the preference
 * is enough. Boards are the one exception — classic and modern boards are
 * genuinely different routes (`user.board-alt` vs `user.board-detail`), so when
 * the switch is used ON a board we transition to the counterpart, behind the
 * shared "Preparing your Board" overlay that the board page's own Modern/Classic
 * toggle already uses.
 *
 * Authenticated only, and never in speak mode: speak mode is a locked-down
 * communication surface where every stray control is a misfire risk.
 */
export default Component.extend({
  tagName: '',

  appState: service('app-state'),
  router: service('router'),

  menu_open: false,

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

  // Close on an outside click or Escape. The modern pill-nav dropdown
  // (authenticated-view.js:1367-1374) only closes on selection, which is
  // tolerable for a menu you open deliberately mid-page — but this one sits in
  // the navbar on EVERY page, so a menu that stays open until you re-click the
  // trigger would follow the user around. `tagName: ''` means there is no
  // component element to bind to, hence the document-level listeners, torn down
  // on destroy.
  didInsertElement() {
    this._super(...arguments);
    var _this = this;
    this._closeOnOutside = function(event) {
      if(!_this.get('menu_open')) { return; }
      var t = event && event.target;
      if(t && t.closest && t.closest('.ll-viewswitch')) { return; }
      _this.set('menu_open', false);
    };
    this._closeOnEscape = function(event) {
      if(event && event.key === 'Escape' && _this.get('menu_open')) {
        _this.set('menu_open', false);
      }
    };
    document.addEventListener('click', this._closeOnOutside, true);
    document.addEventListener('keydown', this._closeOnEscape);
  },

  willDestroyElement() {
    this._super(...arguments);
    if(this._closeOnOutside) { document.removeEventListener('click', this._closeOnOutside, true); }
    if(this._closeOnEscape) { document.removeEventListener('keydown', this._closeOnEscape); }
  },

  // Hidden entirely when there is nobody to hold a preference, in speak mode, and
  // while a board edit session is open.
  //
  // EDIT MODE is a data-loss guard, not tidiness. Switching view on a board
  // transitions to the counterpart route, and app-state's global_transition reacts
  // to leaving `user.board-detail.edit` by calling `toggle_edit_mode()`
  // (services/app-state.js:734), which runs `editManager.clear_history()` and
  // abandons the session.
  //
  // The two deliberate exits — `exit_to_home_from_edit`
  // (controllers/user/board-detail.js:8900) and `cancel_edit` (:8933) — each put
  // `confirm-discard-changes` in front
  // of that WHEN THERE IS SOMETHING TO LOSE. Both are gated on
  // `edit_session_has_changes()` (:4391) and leave without asking on a clean session.
  // Switching view would be a third exit that never asks, on a dirty one included, so
  // unsaved button edits would go without a word. They can switch after leaving edit
  // mode, which asks properly.
  //
  // Re-verified after merging #928 (2026-09-04), which rewrote both exits: it made the
  // prompt conditional on `edit_session_has_changes()` and widened what counts as a
  // change to include display preferences. That WIDENS the set of states this guard
  // protects; the guard itself was not affected, and #928 touched neither this file nor
  // services/app-state.js. An earlier version of this comment claimed both exits always
  // prompt, which #928 made false, and cited :8797/:8806, which the rewrite moved.
  available: computed('appState.currentUser', 'appState.speak_mode', 'appState.edit_mode', function() {
    return !!this.appState.get('currentUser') &&
           !this.appState.get('speak_mode') &&
           !this.appState.get('edit_mode');
  }),

  isClassic: computed('appState.effective_view_user.preferences.board_view_style', function() {
    return is_classic(this.appState.get('effective_view_user'));
  }),

  // The SECONDARY axis: Gentle vs Focused, which overlays whichever primary style
  // (Classic or Card) the user is on. Reads `sessionUser`, NOT `currentUser`, because
  // `sync_layout_scope` (services/app-state.js:4789) observes
  // `sessionUser.preferences.dashboard_layout` and is what puts `body.ll-layout-focused`
  // on the page. Reading anywhere else would let the menu label disagree with the class
  // actually applied.
  isFocused: computed('appState.sessionUser.preferences.dashboard_layout', function() {
    return this.appState.get('sessionUser.preferences.dashboard_layout') === 'focused';
  }),

  // Compressed View (flag `compressed_view`). Offered only with the flag; reads and writes the
  // SESSION user for the same reason as `isFocused`: `sync_density_scope` in
  // services/app-state.js watches that record. Only an exact `true` is on
  // (utils/compressed_view_state.js), matching the server's coercion.
  compressedAvailable: computed('appState.feature_flags.compressed_view', function() {
    return this.appState.get('feature_flags.compressed_view') === true;
  }),

  isCompressed: computed('appState.sessionUser.preferences.compressed_view', function() {
    return this.appState.get('sessionUser.preferences.compressed_view') === true;
  }),

  actions: {
    toggleMenu: function() {
      this.toggleProperty('menu_open');
    },

    // Select Gentle or Focused. No navigation: unlike the Layout switch below, both
    // styles render at the SAME route and the overlay is a body class, so writing the
    // preference is the whole operation.
    //
    // Takes the target explicitly now that the menu lists both options, instead of
    // inverting the current one. Anything that is not 'focused' is treated as 'gentle',
    // matching `isFocused` and the layout engine, so a stray argument cannot persist a
    // value neither of them recognises.
    //
    // Writes `sessionUser` for the reason given on `isFocused` above -- the observer that
    // applies the body class watches that record, so writing `currentUser` would change
    // the stored value without re-theming the page.
    select_layout: function(layout) {
      var user = this.appState.get('sessionUser');
      if(!user || !user.set) { return; }
      this.set('menu_open', false);
      var next = (layout === 'focused') ? 'focused' : 'gentle';
      // Already on it: closing the menu is the whole interaction. Skipping the write
      // avoids a pointless PUT, and keeps re-picking the current style from marking the
      // record dirty.
      if(next === (this.get('isFocused') ? 'focused' : 'gentle')) { return; }
      user.set('preferences.dashboard_layout', next);
      // Ember Data under-marks the raw `preferences` blob, so the dirty bit has to be
      // poked or the PUT can be skipped and the choice would not survive a reload.
      // CREATE the container first: `set('preferences.device.updated')` THROWS on a
      // record whose preferences carry no `device` key (components/boards-layout-toggle.js:166-172).
      if(!user.get('preferences.device')) { user.set('preferences.device', {}); }
      user.set('preferences.device.updated', true);
      if(user.save) { user.save().then(null, function() { }); }
    },

    // Flip Compressed View. Unlike the radio groups this leaves the menu OPEN: it is a switch,
    // and closing the menu would hide the state it just changed. Same save shape as
    // select_layout (create the device container, mark it dirty, save).
    toggle_compressed: function() {
      if(!this.get('compressedAvailable')) { return; }
      var user = this.appState.get('sessionUser');
      if(!user || !user.set) { return; }
      user.set('preferences.compressed_view', !this.get('isCompressed'));
      if(!user.get('preferences.device')) { user.set('preferences.device', {}); }
      user.set('preferences.device.updated', true);
      if(user.save) { user.save().then(null, function() { }); }
    },

    select_view: function(style) {
      /* The record whose view is ON SCREEN, not the session account. While a supervisor
         models for a communicator those differ, and writing `currentUser` there would
         store the change against the supervisor while the page kept rendering the
         communicator's shell -- the control would look dead. See
         app-state#effective_view_user. */
      var user = this.appState.get('effective_view_user');
      if(!user) { return; }
      this.set('menu_open', false);

      // Normalised the same way set_view_style normalises, so the comparison below and
      // the value actually persisted cannot disagree.
      var next = (style === 'classic') ? 'classic' : 'modern';
      // Already on it: no write and, importantly, no transition. The board branch below
      // would otherwise re-enter the route the user is already on, behind a full
      // "Preparing your Board" overlay, for no change at all.
      if(next === view_style(user)) { return; }

      /* Everything from the write onwards moves inside the guard. When the view being changed
         belongs to SOMEONE ELSE -- a communicator being modelled for -- this asks first, and a
         cancel must leave the preference, the overlay and the navigation all untouched, not
         just skip the save. Changing your own view resolves immediately with no modal. */
      var _this = this;
      confirm_view_style_change(this.appState, next).then(function(ok) {
        if(!ok) { return; }
        /* send(), not a direct call: _apply_view lives in the actions hash, so it is not a
           method on the component instance and _this._apply_view would be undefined. */
        _this.send('_apply_view', user, next);
      });
    },

    _apply_view: function(user, next) {
      set_view_style(user, next);

      /* A PAGE THE NEW VIEW DOES NOT HAVE (requested 2026-09-24). "Re-render in place" below
         assumes both views render the route, which is true of nearly everything -- but the
         caseload is Modern's own page, so switching to Basic there left the user on a route
         their view has no template for. `utils/basic_landing` owns the mapping; this only acts
         on the answer.
         ONLY ON THE WAY TO BASIC: every Modern route exists, so there is no equivalent problem
         in the other direction, and testing `next` keeps this from firing on a switch back.
         THE TAB IS HANDED OFF, NOT PERSISTED (2026-09-28). The Basic home page applies it on
         arrival through the action a tab click sends (utils/basic_landing.js, where both halves
         of the handoff live). Until then the switcher wrote `preferences.device.last_index_nav`
         itself, which could only ever carry the three tabs that preference saves -- not Boards
         or Updates. Communicators is still saved, now by `set_index_nav` rather than here.
         THE URL IS PASSED because Updates is an arrival, not a route: `user.logs` counts only
         when it was reached from the pill nav (`?nav=home`). */
      if(next === 'classic') {
        /* WHOSE PAGE IT IS: `page_user` is set for every /:user_id page (routes/user.js), so on
           someone else's library the landing is their account page, not the viewer's own home. */
        var page_user = this.appState.get('page_user');
        var owner = page_user ? { own: is_own_page(page_user, this.appState.get('sessionUser') || this.appState.get('currentUser')), user_name: page_user.get ? page_user.get('user_name') : page_user.user_name } : null;
        var landing = basic_landing_for(this.appState.get('current_route') || '', this.get('router.currentURL'), owner);
        if(landing && landing.query_params) {
          // Same page, other params (Modern's Updates -> Basic's Logs page); replace, so Back does
          // not return to the Updates address.
          this.get('router').replaceWith({ queryParams: landing.query_params });
          return;
        }
        if(landing) {
          if(landing.index_nav) { hand_off_index_nav(this.appState, landing.index_nav, landing); }
          this.get('router').replaceWith(landing.route, ...(landing.models || []));
          return;
        }
      }

      /* ...AND ON THE WAY TO MODERN FROM THE BASIC HOME (2026-10-02, requested). The Basic home is
         one address with four tabs; re-rendering it in place gave the Modern Dashboard whatever tab
         was open. It publishes where you are (app_state.basic_home_place, classic-view.js) and
         `modern_landing_for` names the Modern page for it; replaced, like the Basic direction, so
         Back does not return to the Basic address. Only your OWN home: the route is `index` or
         `user.home` (which sends anyone else's /home to your own, routes/user/home.js). */
      var here = this.appState.get('current_route') || '';
      if(next !== 'classic' && (here === 'index' || here === 'user.home')) {
        var me = this.appState.get('sessionUser') || this.appState.get('currentUser');
        var modern = modern_landing_for(this.appState.get('basic_home_place'), me && me.get('user_name'), this.appState.get('feature_flags'));
        if(modern) {
          this.get('router').replaceWith(modern.route, ...modern.models, { queryParams: modern.query_params });
          return;
        }
      }

      // Non-board pages re-render in place — same route, different template.
      var key = this.appState.get('currentBoardState.key');
      if(!key) { return; }

      // On a board, the two styles are different ROUTES. Resolve the target the
      // same way every other board navigation does, so this cannot drift from
      // routes/board.js.
      var target = board_view_route(user);
      // board-detail fetches /api/v1/boards/<user_name>/<boardname>, so user_name
      // must be the board's OWNER (the key prefix), never the session user — a
      // board owned by someone else (seeded/shared) 404s otherwise. Same reasoning
      // as controllers/board/index.js#go_to_modern.
      var parts = key.split('/');
      if(parts.length < 2) { return; }
      var user_name = parts[0];
      var boardname = parts.slice(1).join('/');
      var routerSvc = this.get('router');

      paint_view_switch_overlay({
        routerSvc: routerSvc,
        // Modern -> Classic renders the parenthetical lighter, matching
        // board-detail.js#go_to_classic; Classic -> Modern keeps the default.
        accentLight: (next === 'classic'),
        isDark: !!this.appState.get('currentUser.preferences.board_dark_mode'),
        transition: function() {
          routerSvc.transitionTo(target, user_name, boardname);
        }
      });
    }
  }
});
