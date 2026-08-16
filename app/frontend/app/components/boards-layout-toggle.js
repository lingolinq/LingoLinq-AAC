import Component from '@ember/component';
import { computed } from '@ember/object';

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
 */

const STORAGE_KEY = 'll_boards_layout';
const BODY_ATTR = 'data-boards-layout';
export const SIDE_BY_SIDE = 'side-by-side';
export const TOP_DOWN = 'top-down';

export default Component.extend({
  classNames: ['ub-boards-page__layout-toggle'],

  /* Defaults to the side-by-side arrangement — it is the current design, and the
     selector exists to check it against the previous one, not to ship the old one. */
  layoutMode: SIDE_BY_SIDE,

  init: function() {
    this._super(...arguments);
    this.set('layoutMode', this._readStored());

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

  isSideBySide: computed('layoutMode', function() {
    return this.get('layoutMode') !== TOP_DOWN;
  }),

  /* localStorage can throw (Safari private mode, disabled storage) and is absent in
     some packaged builds, so every access is guarded rather than assumed. */
  _readStored: function() {
    try {
      var stored = window.localStorage && window.localStorage[STORAGE_KEY];
      return stored === TOP_DOWN ? TOP_DOWN : SIDE_BY_SIDE;
    } catch(e) {
      return SIDE_BY_SIDE;
    }
  },

  _reflect: function(mode) {
    if(typeof document !== 'undefined' && document.body) {
      document.body.setAttribute(BODY_ATTR, mode);
    }
    try {
      if(window.localStorage) { window.localStorage[STORAGE_KEY] = mode; }
    } catch(e) {
      /* Preference simply does not persist; the toggle still works this session. */
    }
  },

  actions: {
    choose: function(mode) {
      if(mode !== SIDE_BY_SIDE && mode !== TOP_DOWN) { return; }
      this.set('layoutMode', mode);
      this._reflect(mode);
    }
  }
});
