import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import modal from '../utils/modal';
import { sync_progress_line } from '../utils/sync_progress';

// The board pages where Speak Mode runs: the drawer stays out of the way there (Traci, 2026-11-11), and comes
// back as soon as the person leaves Speak Mode or the page.
export function on_board_page(route_name) {
  var name = route_name || '';
  return name === 'board' || name.indexOf('board.') === 0 || name.indexOf('user.board-alt') === 0 || name.indexOf('user.board-detail') === 0;
}

/**
 * Bottom-right surface for a running sync, and its result (item 8, PR #1268): the same slot and look as the
 * board-copy drawer (components/copy-progress-drawer.js), mounted once from application.hbs so it is on every
 * page. Hidden while Speak Mode is on a board page, where nothing may cover the board; shown again when
 * Speak Mode ends or the person goes elsewhere. The copy drawer, when one is open, takes the slot.
 */
export default Component.extend({
  sync_notice: service('sync-notice'),
  copy_progress: service('copy-progress'),
  persistence: service('persistence'),
  appState: service('app-state'),
  router: service('router'),
  tagName: '',

  init() {
    this._super(...arguments);
    var self = this;
    this.onDismiss = function() { self.get('sync_notice').dismiss(); };
    this.onDetails = function() { self.open_details(); };
  },

  hidden: computed('appState.speak_mode', 'router.currentRouteName', 'copy_progress.status', function() {
    if(this.get('copy_progress.status')) { return true; }
    return !!(this.get('appState.speak_mode') && on_board_page(this.get('router.currentRouteName')));
  }),

  shown: computed('sync_notice.status', 'hidden', function() {
    return !!this.get('sync_notice.status') && !this.get('hidden');
  }),

  progress_line: computed('persistence.sync_progress.{visited,errored,total}', function() {
    return sync_progress_line(this.get('persistence.sync_progress'));
  }),

  // The same Sync Details as the home pages open (components/dashboard/authenticated-view.js).
  open_details() {
    var p = this.get('persistence');
    var list = (p && p.get && p.get('sync_log')) ? [].concat(p.get('sync_log')).reverse() : [];
    this.get('sync_notice').dismiss();
    modal.open('sync-details', { details: list });
  }
});
