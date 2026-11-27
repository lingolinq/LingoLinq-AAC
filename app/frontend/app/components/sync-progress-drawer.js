import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import modal from '../utils/modal';
import i18n from '../utils/i18n';
import { sync_progress_line, ready_title, picture_warning } from '../utils/sync_progress';
import { summary_for, current_root_name, only_parked_left } from '../utils/sync_rollup';
import { wake_parked } from '../utils/board_retry';

// The board pages where Speak Mode runs: the drawer stays out of the way there (Traci, 2026-11-11), and comes
// back as soon as the person leaves Speak Mode or the page.
export function on_board_page(route_name) {
  var name = route_name || '';
  return name === 'board' || name.indexOf('board.') === 0 || name.indexOf('user.board-alt') === 0 || name.indexOf('user.board-detail') === 0;
}

// Which of the drawer's stages to show (Traci's sync status design, 2026-11-14):
// 'saving' while the sync walks; 'waiting' when all it has left are boards waiting to be tried again
// (utils/board_retry.js); after it, 'ready' (all saved), 'attention' (some folders or boards did not save),
// or 'result' (the plain result card, when the sync left nothing to group, such as a failure before any board).
// The result line, and after it the warning for folders saved without their picture (utils/sync_progress.js).
function with_picture_warning(line, summary) {
  var warning = picture_warning(summary && summary.overall && summary.overall.pictures_missing);
  return warning ? line + ' ' + warning : line;
}

export function drawer_stage(notice_status, notice_kind, sync_progress, summary) {
  if(notice_status === 'syncing') { return only_parked_left(sync_progress) ? 'waiting' : 'saving'; }
  if(!summary || notice_kind === 'failed') { return 'result'; }
  if(notice_kind === 'succeeded' && summary.overall.missing === 0) { return 'ready'; }
  if(summary.overall.missing > 0) { return 'attention'; }
  return 'result';
}

/**
 * Bottom-right surface for a running sync, and its result (item 8, PR #1268): the same slot and look as the
 * board-copy drawer (components/copy-progress-drawer.js), mounted once from application.hbs so it is on every
 * page. Hidden while Speak Mode is on a board page, where nothing may cover the board; shown again when
 * Speak Mode ends or the person goes elsewhere. Hiding it never touches the sync. The copy drawer, when one is
 * open, takes the slot.
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
    this.onTryNow = function() { wake_parked(self.get('persistence.sync_progress')); };
    this.onTryAgain = function() { self.try_again(); };
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

  summary: computed('sync_notice.{status,kind}', 'persistence.{syncing,sync_log_rand}', 'persistence.sync_log.length', 'persistence.sync_progress.{visited,errored}', function() {
    return summary_for(this.get('persistence'), { latest_only: true }); // the sync that just ended, never an earlier one
  }),

  stage: computed('sync_notice.{status,kind}', 'persistence.sync_progress.{parked,to_visit}', 'summary', function() {
    return drawer_stage(this.get('sync_notice.status'), this.get('sync_notice.kind'), this.get('persistence.sync_progress'), this.get('summary'));
  }),
  is_saving: computed('stage', function() { return this.get('stage') === 'saving'; }),
  is_waiting: computed('stage', function() { return this.get('stage') === 'waiting'; }),
  is_ready: computed('stage', function() { return this.get('stage') === 'ready'; }),
  is_attention: computed('stage', function() { return this.get('stage') === 'attention'; }),
  tone: computed('stage', 'sync_notice.is_success', function() {
    var stage = this.get('stage');
    if(stage === 'saving' || stage === 'waiting') { return 'copying'; }
    if(stage === 'ready') { return 'done'; }
    if(stage === 'attention') { return 'attention'; }
    return this.get('sync_notice.is_success') ? 'done' : 'error';
  }),
  done_icon: computed('tone', function() { return this.get('tone') === 'done'; }),

  // The board the sync is saving now, by name.
  current_board: computed('persistence.sync_progress.{visited,errored}', function() {
    var p = this.get('persistence.sync_progress');
    return p ? current_root_name(p.board_statuses, p.board_roots) : null;
  }),

  // Two kinds of parked work (services/persistence.js sync_boards): a folder not saved yet, and a saved folder whose
  // pictures or sounds were cut off (utils/board_content_retry.js). Each is said as it is; the folder is not "left"
  // when only its pictures wait, and not "saved" either, since the result card says "didn't save" if their retries run
  // out (Traci, 2026-11-19).
  waiting_line: computed('persistence.sync_progress.{parked,parked_content}', function() {
    var content = this.get('persistence.sync_progress.parked_content') || 0;
    var boards = Math.max(0, (this.get('persistence.sync_progress.parked') || 0) - content);
    var lines = [];
    if(boards || !content) {
      lines.push(boards === 1 ? i18n.t('sync_drawer_waiting_one', "1 folder is left. It will be tried again automatically.") :
        i18n.t('sync_drawer_waiting_many', "%{n} folders are left. They will be tried again automatically.", { n: boards }));
    }
    if(content) {
      lines.push(content === 1 ? i18n.t('sync_drawer_waiting_content_one', "1 folder's pictures or sounds are still downloading. They will be tried again automatically.") :
        i18n.t('sync_drawer_waiting_content_many', "%{n} folders' pictures or sounds are still downloading. They will be tried again automatically.", { n: content }));
    }
    return lines.join(' ');
  }),

  // A ready sync with a folder saved without its picture offers Try again beside Sync Details (Traci, 2026-11-18); a
  // sync that needs attention already leads with it.
  offer_try_again: computed('stage', 'summary.overall.warned', function() {
    return this.get('stage') === 'ready' && !!(this.get('summary.overall.warned'));
  }),

  // The same words as Sync Details' headline (utils/sync_progress.js ready_title).
  result_title: computed('stage', 'summary', 'sync_notice.message', function() {
    var stage = this.get('stage');
    if(stage === 'ready' || stage === 'attention') { return ready_title(this.get('summary')); }
    return this.get('sync_notice.message');
  }),

  result_detail: computed('stage', 'summary', 'sync_notice.detail', function() {
    var s = this.get('summary');
    var stage = this.get('stage');
    if(stage === 'ready') {
      var n = s.overall.saved;
      return with_picture_warning(n === 1 ? i18n.t('sync_drawer_saved_one', "1 board is saved on this device.") :
        i18n.t('sync_drawer_saved_many', "%{n} boards and folders are saved on this device.", { n: n }), s);
    }
    if(stage === 'attention') {
      var missing = s.groups.filter(function(g) { return !g.ready; });
      var only = missing.length === 1 ? missing[0] : null;
      if(only && !only.board_missing) {
        var f = only.folders_missing.length;
        return with_picture_warning(f === 1 ? i18n.t('sync_drawer_one_folder_of', "1 folder of %{board} didn't save. It still opens while you're online.", { board: only.name }) :
          i18n.t('sync_drawer_n_folders_of', "%{n} folders of %{board} didn't save. They still open while you're online.", { n: f, board: only.name }), s);
      }
      return with_picture_warning(s.overall.missing === 1 ? i18n.t('sync_drawer_one_missing', "1 board didn't save. It still opens while you're online.") :
        i18n.t('sync_drawer_n_missing', "%{n} boards and folders didn't save. They still open while you're online.", { n: s.overall.missing }), s);
    }
    return this.get('sync_notice.detail');
  }),

  try_again() {
    var p = this.get('persistence');
    this.get('sync_notice').dismiss();
    if(p && typeof p.sync === 'function' && !p.get('syncing')) {
      p.sync('self', true).then(null, function() {});
    }
  },

  // The same Sync Details as the home pages open (components/dashboard/authenticated-view.js).
  open_details() {
    var p = this.get('persistence');
    var list = (p && p.get && p.get('sync_log')) ? [].concat(p.get('sync_log')).reverse() : [];
    this.get('sync_notice').dismiss();
    modal.open('sync-details', { details: list });
  }
});
