import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import { is_classic, other_view_style, set_view_style } from '../utils/view_style';
import { board_view_route } from '../utils/board_view';
import paint_view_switch_overlay from '../utils/view_switch_overlay';

/**
 * The navbar "View" dropdown — the app-wide Classic/Modern switch.
 *
 * One menu item, showing the style you are NOT on: "Classic View" while in Card
 * View, "Card View" while in classic. Picking it writes
 * `preferences.board_view_style` (see utils/view_style.js for why that key) and
 * the whole app follows, because every classic surface branches on the same
 * preference.
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

  isClassic: computed('appState.currentUser.preferences.board_view_style', function() {
    return is_classic(this.appState.get('currentUser'));
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

  actions: {
    toggleMenu: function() {
      this.toggleProperty('menu_open');
    },

    // Flip Gentle <-> Focused. No navigation: unlike the Classic/Card switch below,
    // both layouts render at the SAME route and the overlay is a body class, so
    // flipping the preference is the whole operation.
    //
    // Writes `sessionUser` for the reason given on `isFocused` above -- the observer that
    // applies the body class watches that record, so writing `currentUser` would change
    // the stored value without re-theming the page.
    switch_layout: function() {
      var user = this.appState.get('sessionUser');
      if(!user || !user.set) { return; }
      this.set('menu_open', false);
      var next = this.get('isFocused') ? 'gentle' : 'focused';
      user.set('preferences.dashboard_layout', next);
      // Ember Data under-marks the raw `preferences` blob, so the dirty bit has to be
      // poked or the PUT can be skipped and the choice would not survive a reload.
      // CREATE the container first: `set('preferences.device.updated')` THROWS on a
      // record whose preferences carry no `device` key (components/boards-layout-toggle.js:166-172).
      if(!user.get('preferences.device')) { user.set('preferences.device', {}); }
      user.set('preferences.device.updated', true);
      if(user.save) { user.save().then(null, function() { }); }
    },

    switch_view: function() {
      var user = this.appState.get('currentUser');
      if(!user) { return; }
      this.set('menu_open', false);

      var next = other_view_style(user);
      set_view_style(user, next);

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
