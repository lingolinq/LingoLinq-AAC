import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { board_edit_route } from '../utils/board_view';

/**
 * Bottom-right surface for a board copy running in the background.
 *
 * Two states, same slot: a drawer while the copy runs (the user minimized the
 * "Copying Board" modal by clicking outside it), then — in place of the drawer —
 * a result card when the copy settles. Mounted once from application.hbs so it
 * survives the route transitions that clear the modal slot.
 *
 * Navigation lives here rather than in the copy-progress service: the service is
 * state only, and by the time the card is on screen the modal component that
 * started the copy is long gone.
 */
export default Component.extend({
  copy_progress: service('copy-progress'),
  appState: service('app-state'),
  // Same service as appState, under the name the template reads for the toast
  // collision check (`app_state.toast` → the --above-toast modifier).
  app_state: service('app-state'),
  router: service('router'),
  tagName: '',

  init() {
    this._super(...arguments);
    // Bound in init (not passed as `this.dismiss`) so `this` is the component
    // when {{on}} invokes it — a bare method reference is called unbound.
    var self = this;
    this.onDismiss = function() {
      self.get('copy_progress').dismiss();
    };
    this.onOpen = function() {
      self.open_copy();
    };
  },

  // Take the user to the finished copy. A copy started in order to EDIT a board
  // lands in edit mode; every other copy opens in speak mode, matching what the
  // foreground modal does when the user waits for it.
  open_copy() {
    const copy = this.get('copy_progress.copy');
    this.get('copy_progress').dismiss();
    if (!copy) { return; }
    const parts = copy.key ? String(copy.key).split('/') : [];
    if (copy.for_editing && parts.length >= 2) {
      // View-aware edit destination. board-detail has an /edit subroute; the
      // classic board has none (router.js declares only `index` under board-alt) —
      // classic editing is a MODE entered via app_state.toggle_edit_mode. So a
      // classic user lands on their own board here rather than being ejected into
      // modern. KNOWN GAP: edit mode is not auto-entered for them; closing that
      // needs the classic edit route (Cluster C in the restoration plan).
      this.get('router').transitionTo(board_edit_route(this.get('appState.currentUser')), parts[0], parts.slice(1).join('/'));
      return;
    }
    this.get('appState').jump_to_board({ id: copy.id, key: copy.key });
  }
});
