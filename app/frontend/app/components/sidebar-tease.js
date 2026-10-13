import Component from '@ember/component';
import { inject as service } from '@ember/service';

/**
 * Reusable sidebar tease toggle button.
 *
 * Renders the double-chevron sidebar toggle that appears in speak mode. Because
 * `application.hbs` renders this only when `app_state.sidebar_visible` is false, it is the
 * only in-context way to re-open a collapsed sidebar.
 *
 * Usage:
 *   <SidebarTease />
 *
 * Reads speak_mode and sidebar preferences from app-state, toggles the sidebar via the
 * stashes service.
 *
 * CLICKS ROUTE THROUGH `ctrlAction`, NOT a bare method reference. Ember 5's `{{on}}` hands
 * the raw function to addEventListener without binding it, so a classic prototype method
 * receives the DOM element as `this` (or dev's untouchable-this proxy) and every `this.get`
 * throws. That is not hypothetical here: it is the defect this file shipped with, and it
 * left a collapsed sidebar unrecoverable in place. `actions: {}` plus a component-local
 * `ctrlAction` is the pattern this codebase settled on for exactly this case -- see
 * `components/password-field.js` and the "Classic component methods on {{on}}" entry in
 * `docs/task-management/learnings-archive/LEARNINGS-2026-01_to_2026-09.md`.
 */
export default Component.extend({
  tagName: '',
  appState: service('app-state'),
  stashes: service('stashes'),

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

  actions: {
    toggleSidebar() {
      var stashes = this.get('stashes');
      if (stashes) {
        stashes.persist('sidebarEnabled', !stashes.get('sidebarEnabled'));
      }
    }
  }
});
