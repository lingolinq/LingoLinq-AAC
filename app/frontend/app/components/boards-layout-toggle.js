import Component from '@ember/component';
import { computed, observer } from '@ember/object';
import { inject as service } from '@ember/service';
import {
  SIDE_BY_SIDE,
  TOP_DOWN,
  readStoredLayout,
  writeStoredLayout
} from '../utils/boards_layout_state';

/**
 * Boards-page layout selector — SIDE-BY-SIDE (Folders 1/4 left, Boards 3/4 right)
 * versus TOP-DOWN (the original stacked order). Exists so the two arrangements can be
 * compared on the real page instead of from screenshots.
 *
 * SELF-CONTAINED ON PURPOSE. The boards route runs on `controllers/user/index`
 * (routes/user/boards.js sets `controllerName`), which is a large controller shared
 * with the ACCOUNT page — adding view state there would widen a file that is already
 * overloaded and leak this toggle onto a page it does not belong to. Everything this
 * needs lives here instead.
 *
 * The choice is reflected as `data-boards-layout` on <body>, mirroring the pattern the
 * app already uses for `body.ll-layout-focused` (services/app-state#sync_layout_scope).
 * That keeps the CSS a plain attribute selector rather than threading a class down
 * through BoardsBrowser -> AvailableBoardsSection to reach `.ub-boards-page__boards-body`.
 *
 * PERSISTENCE — the USER PREFERENCE is authoritative, localStorage is only a mirror.
 * Choosing top-down saves `preferences.boards_layout` on the user record, so the choice
 * follows them to a new login, a new browser and a new device. localStorage is kept as a
 * SAME-DEVICE cache so the correct layout paints on the very first frame, before the user
 * record has hydrated — otherwise a top-down user watches the page render side-by-side
 * and snap. Read order is therefore: preference (if a user is loaded) -> localStorage ->
 * SIDE_BY_SIDE. A logged-out or offline session still works, just device-locally.
 */

const BODY_ATTR = 'data-boards-layout';
/* The storage key and its guarded accessors live in utils/boards_layout_state so they are
   defined once — app-state must clear the mirror on sign-out, and a service cannot import a
   component. Re-exported here because this module was the original home of these two
   constants and importers (including the unit test) still take them from it. */
export { SIDE_BY_SIDE, TOP_DOWN };

export default Component.extend({
  classNames: ['ub-boards-page__layout-toggle'],
  appState: service('app-state'),

  /* Defaults to the side-by-side arrangement — it is the current design, and the
     selector exists to check it against the previous one, not to ship the old one.
     This constant is the SINGLE source of truth for the default: the server
     deliberately stores no default for `boards_layout` (see user.rb), so an absent
     preference means "never chosen" and lands here. */
  layoutMode: SIDE_BY_SIDE,

  init: function() {
    this._super(...arguments);
    this.set('layoutMode', this._resolveMode());

    /* Same `sendAction` FACTORY contract this codebase already uses (see the long
       note in components/available-boards-section.js ~111). It RETURNS the handler,
       so templates bind it BARE — `{{on "click" (this.sendAction "choose" "top-down")}}`.
       Do NOT wrap it in `(fn …)`: that calls the factory on click and discards the
       handler it returns, so the action silently never runs. */
    var self = this;
    this.sendAction = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function() {
        self.send.apply(self, [actionName].concat(bound));
      };
    };

    /* BOUND HERE, not left as a class-body method. `{{on}}` passes the function
       straight to addEventListener, which sets `this` to the element the listener is
       on -- so a bare `{{on "keydown" this.onGroupKeydown}}` made `this` the
       <span role="radiogroup">, and the first `this.get(...)` threw. Because the
       handler calls preventDefault() before that, the arrow key was swallowed AND the
       action never ran: with the roving tabindex only the CHECKED radio is tabbable,
       so Tab+Enter merely re-selects the current value and the layout could not be
       changed by keyboard or switch at all (WCAG 2.1.1). Same closure idiom as
       `sendAction` above and components/grid-size-picker.js#onGridKeydown. */
    this.onGroupKeydown = function(event) { self._handleGroupKeydown(event); };
  },

  didInsertElement: function() {
    this._super(...arguments);
    this._reflect(this.get('layoutMode'));
  },

  willDestroyElement: function() {
    this._super(...arguments);
    /* Leave no stale attribute behind for other routes to inherit — the CSS is scoped
       to `#content.boards-page`, but a lingering attribute would still be misleading. */
    if(typeof document !== 'undefined' && document.body) {
      document.body.removeAttribute(BODY_ATTR);
    }
  },

  /* ArrowLeft/Up/Right/Down move selection AND focus, per the ARIA radiogroup pattern.
     With exactly two options every arrow simply moves to the other one, so there is no
     index arithmetic to get wrong. Selection follows focus because choosing is instant
     and reversible — there is no commit step to defer to. */
  _handleGroupKeydown: function(event) {
    var key = event && event.key;
    if(key !== 'ArrowRight' && key !== 'ArrowDown' && key !== 'ArrowLeft' && key !== 'ArrowUp') { return; }
    event.preventDefault();
    var root = event.currentTarget;
    this.send('choose', this.get('isSideBySide') ? TOP_DOWN : SIDE_BY_SIDE);
    /* Focus the button that is about to become checked. The re-render has not happened
       yet, so that is the currently-unchecked one. */
    if(root && root.querySelector) {
      var target = root.querySelector('[aria-checked="false"]');
      if(target && target.focus) { target.focus(); }
    }
  },

  isSideBySide: computed('layoutMode', function() {
    return this.get('layoutMode') !== TOP_DOWN;
  }),

  /* PREFERENCE first, then the device mirror, then the default. The preference wins
     even when localStorage disagrees — that is the whole point of persisting it: a
     user who chose top-down on their laptop must get top-down on a fresh login here,
     regardless of what this browser happens to remember. */
  _resolveMode: function() {
    var pref = this.get('appState.currentUser.preferences.boards_layout');
    if(pref === TOP_DOWN || pref === SIDE_BY_SIDE) { return pref; }
    return this._readStored();
  },

  /* The user record can hydrate AFTER this component renders (fresh login, cold cache),
     which would otherwise leave the page on the localStorage guess or the default while
     the real preference sat unread. Re-resolve when it arrives — but only adopt a
     genuine stored preference, so a late-arriving record with no preference never
     overrides a choice the user just made in this session. */
  _prefArrived: observer('appState.currentUser.preferences.boards_layout', function() {
    var pref = this.get('appState.currentUser.preferences.boards_layout');
    if(pref !== TOP_DOWN && pref !== SIDE_BY_SIDE) { return; }
    if(pref === this.get('layoutMode')) { return; }
    this.set('layoutMode', pref);
    this._reflect(pref);
  }),

  /* localStorage can throw (Safari private mode, disabled storage) and is absent in
     some packaged builds, so every access is guarded rather than assumed. */
  _readStored: function() {
    try {
      return readStoredLayout();
    } catch(e) {
      return SIDE_BY_SIDE;
    }
  },

  /* Persist to the USER, serialized. The toggle is two adjacent buttons, so it is easy
     to click twice quickly; concurrent `user.save()` calls on one record can complete
     out of order (the earlier PUT winning and dropping the later choice) or throw while
     one is in flight. Chain the saves so they run one at a time — each chained save
     serializes the record's CURRENT attributes, so coalescing is safe — and keep the
     chain alive past a rejection so one failed save cannot wedge the queue.
     See utils/LEARNINGS "serialize rapid model saves" / components/sidebar-editor.js#_save. */
  _persist: function(mode) {
    var user = this.get('appState.currentUser');
    if(!user || !user.set) { return; }
    if(user.get('preferences.boards_layout') === mode) { return; }
    user.set('preferences.boards_layout', mode);
    /* Ember Data under-marks the raw preferences blob, so bump the device dirty bit the
       same way the board-dark-mode and dashboard saves do, or the PUT can be skipped.
       CREATE the container first when it is missing: `set('preferences.device.updated')`
       THROWS ("object in path could not be found") on a record whose preferences carry no
       `device` key, and it throws from inside the click handler — the layout would flip on
       screen and then silently never persist. Other call sites assume `device` exists; this
       one does not. */
    if(!user.get('preferences.device')) { user.set('preferences.device', {}); }
    user.set('preferences.device.updated', true);
    if(!user.save) { return; }
    var noop = function() {};
    var prior = this._saveChain || Promise.resolve();
    this._saveChain = prior.then(noop, noop).then(function() { return user.save(); });
    this._lastSave = this._saveChain;
    this._saveChain.then(noop, noop);
  },

  _reflect: function(mode) {
    if(typeof document !== 'undefined' && document.body) {
      document.body.setAttribute(BODY_ATTR, mode);
    }
    writeStoredLayout(mode);
  },

  actions: {
    choose: function(mode) {
      if(mode !== SIDE_BY_SIDE && mode !== TOP_DOWN) { return; }
      /* Optimistic and synchronous: the layout flips now, the save settles behind it.
         A user waiting on a round trip to see a layout change would read as lag. */
      this.set('layoutMode', mode);
      this._reflect(mode);
      this._persist(mode);
    }
  }
});
