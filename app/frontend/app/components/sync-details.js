import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { set as emberSet, get as emberGet } from '@ember/object';
import { computed } from '@ember/object';
import { htmlSafe } from '@ember/template';
import modal from '../utils/modal';
import i18n from '../utils/i18n';
import { sync_progress_line, ready_title, picture_warning } from '../utils/sync_progress';
import { summary_for } from '../utils/sync_rollup';
import { restored_lead_kind } from '../utils/sync_log_store';
import { summary_text, counter_lines } from '../utils/sync_summary';

// How many saved folders a card shows before "Show all".
var SAVED_SHOWN = 8;

function role_label(role) {
  if(role === 'home board') { return i18n.t('sync_role_home_board', "Home board"); }
  if(role === 'sidebar board') { return i18n.t('sync_role_sidebar_board', "Sidebar board"); }
  if(role === 'starred board' || role === 'suggested board') { return i18n.t('sync_role_liked_board', "Liked board"); }
  if(role === 'crisis vocabulary') { return i18n.t('sync_role_always_kept', "Always kept"); }
  return i18n.t('sync_role_board', "Board");
}

function folders_inside(n) {
  if(n === 0) { return i18n.t('sync_no_folders_inside', "No folders inside"); }
  return n === 1 ? i18n.t('sync_one_folder_inside', "1 folder inside") : i18n.t('sync_n_folders_inside', "%{n} folders inside", { n: n });
}

/**
 * Sync Details modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  persistence: service('persistence'),
  stashes: service('stashes'),
  appState: service('app-state'),
  session: service('session'),
  // How the running sync is doing (item 8): the same line as the home cards.
  sync_progress_line: computed('persistence.sync_progress.{visited,errored,total}', function() {
    return sync_progress_line(this.get('persistence.sync_progress'));
  }),

  // ---- Grouped view (Traci's combined design, 2026-11-14: one card per board the person knows, its folders inside;
  // utils/sync_rollup.js). The running sync while one runs, otherwise the last finished sync on this device. ----
  tab: null, // 'attention' | 'ready' | 'all'; null picks attention when something needs it
  open_cards: null,
  all_saved_cards: null,
  show_technical: false,

  summary: computed('persistence.{syncing,sync_log_rand}', 'persistence.sync_log.length', 'persistence.sync_progress.{visited,errored}', function() {
    return summary_for(this.get('persistence'));
  }),
  // After an app restart no sync has run yet, so sync_status is null and the status line would say "Synced and ready
  // for offline" even when the restored log ends in a cancel, a failure or problems (utils/sync_log_store.js). This is
  // the line for those; null keeps the usual one.
  restored_lead: computed('persistence.{sync_status,syncing,sync_log_rand}', 'persistence.sync_log.length', function() {
    var p = this.get('persistence');
    if(!p || typeof p.get !== 'function' || p.get('sync_status') || p.get('syncing')) { return null; }
    var kind = restored_lead_kind(p.get('sync_log'));
    if(kind === 'canceled') { return i18n.t('sync_lead_last_canceled', "The last sync was canceled."); }
    if(kind === 'errored') { return i18n.t('sync_lead_last_failed', "The last sync didn't finish. Some boards may not be ready offline."); }
    if(kind === 'issues') { return i18n.t('sync_lead_last_issues', "The last sync finished, but some boards didn't save."); }
    return null;
  }),
  // No percentage anywhere (Traci, 2026-11-16; docs/task-management/2026-11-16_sync-details-no-percent.md). A running
  // sync, or one that stopped with no finished sync before it, is `unfinished` (utils/sync_rollup.js summary_for): its
  // rows are only the boards reached, so it gets no headline, no tabs and no Ready labels.
  unfinished: computed('summary', function() { var s = this.get('summary'); return !!(s && s.unfinished); }),
  stopped: computed('summary', function() { var s = this.get('summary'); return !!(s && s.stopped); }),
  show_tabs: computed('summary', 'unfinished', function() { return !!this.get('summary') && !this.get('unfinished'); }),
  // The drawer's words for the newest finished sync. None for cards from an earlier sync, which sit under a status line
  // about a later one that failed or was cancelled (Traci, 2026-11-16), and none for an unfinished one.
  headline: computed('summary', 'unfinished', function() {
    var s = this.get('summary');
    if(!s || this.get('unfinished') || s.from_earlier) { return null; }
    return ready_title(s);
  }),
  // A stopped sync that saved nothing (every row not saved or failed): its heading and count say so (round-1 review Low 4).
  nothing_saved: computed('summary', 'stopped', function() { var s = this.get('summary'); return !!(s && this.get('stopped') && s.overall.saved === 0); }),
  summary_line: computed('summary', 'unfinished', 'stopped', function() {
    var s = this.get('summary');
    if(!s) { return null; }
    if(this.get('stopped')) {
      var n = s.overall.saved;
      if(n === 0) { return i18n.t('sync_drawer_saved_none', "No boards are saved on this device yet."); }
      return n === 1 ? i18n.t('sync_drawer_saved_one', "1 board is saved on this device.") :
        i18n.t('sync_drawer_saved_many', "%{n} boards and folders are saved on this device.", { n: n });
    }
    if(this.get('unfinished')) { return null; } // the status line says how many are saved so far
    return i18n.t('sync_saved_of_total', "%{saved} of %{total} boards and folders are saved on this device.", { saved: s.overall.saved, total: s.overall.total });
  }),
  // How long the sync the cards describe took, what it downloaded and what could not be saved (item 0.1,
  // utils/sync_summary.js). Shown under the status line; none while a sync runs.
  run_summary: computed('summary', function() { return summary_text(this.get('summary')); }),
  // Only a finished sync knows what is missing; an unfinished one's failures are only those reached so far.
  missing_count: computed('summary', 'unfinished', function() { var s = this.get('summary'); return s && !this.get('unfinished') ? s.overall.missing : 0; }),
  save_missing_label: computed('missing_count', function() {
    var n = this.get('missing_count');
    return n === 1 ? i18n.t('sync_save_the_one_now', "Save it now") : i18n.t('sync_save_the_n_now', "Save the %{n} now", { n: n });
  }),
  attention_count: computed('summary', function() { var s = this.get('summary'); return s ? s.groups.filter(function(g) { return !g.ready; }).length : 0; }),
  current_tab: computed('tab', 'attention_count', function() {
    return this.get('tab') || (this.get('attention_count') > 0 ? 'attention' : 'all');
  }),
  tabs: computed('current_tab', 'summary', 'attention_count', function() {
    var self = this;
    var s = this.get('summary');
    var total = s ? s.groups.length : 0;
    var attention = this.get('attention_count');
    var current = this.get('current_tab');
    return [
      { id: 'attention', label: i18n.t('sync_tab_needs_attention', "Needs attention"), count: attention, tone: 'attention' },
      { id: 'ready', label: i18n.t('sync_tab_ready_offline', "Ready offline"), count: total - attention, tone: 'ready' },
      { id: 'all', label: i18n.t('sync_tab_all_boards', "All boards"), count: total, tone: 'all' }
    ].map(function(t) {
      t.selected = t.id === current;
      t.aria_selected = t.selected ? 'true' : 'false';
      t.pick = function() { self.set('tab', t.id); };
      return t;
    });
  }),
  // On Needs attention the ready boards are not listed, so a folder saved without its picture is named here instead.
  // Not while unfinished: there are no tabs then, every board is listed, and each card names its own (cards).
  picture_warning_line: computed('summary', 'current_tab', 'unfinished', function() {
    var s = this.get('summary');
    return s && !this.get('unfinished') && this.get('current_tab') === 'attention' ? picture_warning(s.overall.pictures_missing) : null;
  }),

  cards: computed('summary', 'current_tab', 'open_cards', 'all_saved_cards', 'unfinished', 'stopped', function() {
    var self = this;
    var s = this.get('summary');
    if(!s) { return []; }
    var unfinished = this.get('unfinished');
    var stopped = this.get('stopped');
    var tab = unfinished ? 'all' : this.get('current_tab'); // no tabs while unfinished: every board
    var open = this.get('open_cards') || {};
    var all_saved = this.get('all_saved_cards') || {};
    var first_attention = (s.groups.find(function(g) { return !g.ready; }) || s.groups.find(function(g) { return g.pictures_missing.length > 0; }) || {}).key; // nothing needs attention: the first board saved without its picture
    return s.groups.filter(function(g) {
      return tab === 'all' || (tab === 'attention' ? !g.ready : g.ready);
    }).map(function(g) {
      var is_open = (g.key in open) ? open[g.key] : (g.key === first_attention);
      var show_all = !!all_saved[g.key];
      var missing = g.folders_missing.length;
      var face = unfinished ? self.unfinished_card(g, stopped) : self.finished_card(g);
      // What every card has, whatever the sync's state: its folder lists and whether it is open.
      return Object.assign(face, {
        missing_title: i18n.t('sync_not_saved_yet_n', "Not saved yet · %{n}", { n: missing }),
        saved_title: i18n.t('sync_saved_n', "Saved · %{n}", { n: g.saved_count }),
        folders_missing: g.folders_missing,
        folders_saved: show_all ? g.folders_saved : g.folders_saved.slice(0, SAVED_SHOWN),
        has_missing: missing > 0,
        pictures_missing: g.pictures_missing,
        has_picture_warning: g.pictures_missing.length > 0,
        pictures_title: i18n.t('sync_picture_not_saved_n', "Picture not saved · %{n}", { n: g.pictures_missing.length }),
        has_saved: g.saved_count > 0,
        has_more_saved: g.saved_count > SAVED_SHOWN,
        more_label: show_all ? i18n.t('sync_show_fewer', "Show fewer") : i18n.t('sync_show_all_saved_n', "Show all %{n} saved folders", { n: g.saved_count }),
        more_expanded: show_all ? 'true' : 'false',
        open: is_open, expanded: is_open ? 'true' : 'false',
        toggle: function() { var o = Object.assign({}, self.get('open_cards') || {}); o[g.key] = !is_open; self.set('open_cards', o); },
        toggle_more: function() { var a = Object.assign({}, self.get('all_saved_cards') || {}); a[g.key] = !show_all; self.set('all_saved_cards', a); }
      });
    });
  }),
  // A card for a board a finished sync checked: Ready offline or what is waiting, and how many of its folders saved.
  finished_card(g) {
    var missing = g.folders_missing.length;
    return {
      key: g.key, name: g.name, ready: g.ready, tone: g.ready ? 'ready' : 'attention', role: role_label(g.role),
      folders_inside: folders_inside(g.folder_count),
      has_folders: g.folder_count > 0,
      status: g.ready ? i18n.t('sync_card_ready_offline', "Ready offline") :
        (missing > 0 ? (missing === 1 ? i18n.t('sync_card_one_folder_waiting', "1 folder waiting") : i18n.t('sync_card_n_folders_waiting', "%{n} folders waiting", { n: missing })) : i18n.t('sync_card_not_saved', "Not saved yet")),
      count: g.folder_count > 0 ? i18n.t('sync_card_folders_saved', "%{saved} of %{total} folders saved", { saved: g.saved_count, total: g.folder_count }) : (g.board_missing ? i18n.t('sync_card_not_saved', "Not saved yet") : i18n.t('sync_card_saved', "Saved")),
      bar_style: htmlSafe('width: ' + (g.folder_count > 0 ? Math.floor(100 * g.saved_count / g.folder_count) : (g.board_missing ? 0 : 100)) + '%;'),
      intro_title: i18n.t('sync_folders_inside_title', "Folders inside %{name}", { name: g.name }),
      intro_text: g.folder_count === 1 ? i18n.t('sync_folders_intro_one', "This board opens from a folder button on %{name}. It is saved separately.", { name: g.name }) :
        i18n.t('sync_folders_intro_many', "These %{n} boards open from folder buttons on %{name}. Each one is saved separately.", { n: g.folder_count, name: g.name }),
      no_folders_text: i18n.t('sync_board_no_folders', "%{name} has no folders inside. It is saved as a single board.", { name: g.name })
    };
  },
  // A card for a board an unfinished sync reached: how many folders it saved, with no Ready label, no total and no bar
  // (the sync did not reach every folder). Missing folders are only the failures it recorded.
  unfinished_card(g, stopped) {
    var n = g.saved_count;
    return {
      key: g.key, name: g.name, ready: false, tone: g.folders_missing.length > 0 || g.board_missing ? 'attention' : 'saved', unfinished: true,
      role: role_label(g.role), folders_inside: null, status: null, bar_style: null,
      has_folders: g.folder_count > 0,
      count: g.folder_count > 0 ? (n === 1 ? i18n.t('sync_card_one_folder_saved', "1 folder saved") : i18n.t('sync_card_n_folders_saved_only', "%{n} folders saved", { n: n })) :
        (g.board_missing ? i18n.t('sync_card_not_saved', "Not saved yet") : i18n.t('sync_card_saved', "Saved")),
      intro_title: i18n.t('sync_folders_inside_title', "Folders inside %{name}", { name: g.name }),
      intro_text: i18n.t('sync_folders_intro_unfinished', "These open from folder buttons on %{name}.", { name: g.name }),
      no_folders_text: stopped ? i18n.t('sync_no_folders_saved_before_stop', "No folders were saved before the sync stopped.") :
        i18n.t('sync_no_folders_saved_yet', "No folders are saved yet.")
    };
  },
  tagName: '',

  details: computed(
    'persistence.sync_log',
    'persistence.sync_log.length',
    'persistence.sync_log.@each.status',
    function() {
      const persistenceService = this.persistence;
      if (!persistenceService || typeof persistenceService.get !== 'function') {
        return [];
      }
      const details = ([].concat(persistenceService.get('sync_log') || [])).reverse();
      (details || []).forEach(function(sync) {
        emberSet(sync, 'cached', sync.statuses.filter(function(s) { return s.status === 'cached'; }).length);
        emberSet(sync, 'downloaded', sync.statuses.filter(function(s) { return s.status === 'downloaded'; }).length);
        emberSet(sync, 're_downloaded', sync.statuses.filter(function(s) { return s.status === 're-downloaded'; }).length);
        emberSet(sync, 'counter_lines', counter_lines(sync)); // utils/sync_summary.js: the sync's counters, for support
        sync.statuses.forEach(function(s, idx) { s.idx = idx; });
        emberSet(sync, 'sorted_statuses', sync.statuses.sort(function(a, b) {
          if (a.error && !b.error) { return -1; }
          if (!a.error && b.error) { return 1; }
          return a.key.localeCompare(b.key);
        }));
        sync.statuses.forEach(function(s) {
          emberSet(s, (s.status || '').replace(/-/, '_'), true);
        });
      });
      return details;
    }
  ),

  needs_sync: computed('persistence.last_sync_at', function() {
    const p = this.get('persistence');
    if (!p || typeof p.get !== 'function') { return false; }
    const now = (new Date()).getTime() / 1000;
    const lastSync = p.get('last_sync_at') || 0;
    return (now - lastSync) > (7 * 24 * 60 * 60);
  }),

  first_log_date: computed('stashes.usage_log.length', function() {
    const stashes = this.stashes;
    if(!stashes || typeof stashes.get !== 'function') { return null; }
    const log = stashes.get('usage_log')[0];
    if (log) {
      return new Date(log.timestamp * 1000);
    }
    return null;
  }),
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
    this.ctrlActionNoBubble = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function(event) {
        if (event && event.stopPropagation) { event.stopPropagation(); }
        if (event && event.preventDefault) { event.preventDefault(); }
        self.send.apply(self, [actionName].concat(bound));
      };
    };
  },


  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    toggle_statuses(sync) {
      emberSet(sync, 'toggled', !emberGet(sync, 'toggled'));
    },
    toggle_technical() {
      this.set('show_technical', !this.get('show_technical'));
    },
    cancel_sync() {
      const persistenceService = this.persistence;
      if (persistenceService && typeof persistenceService.get === 'function' && persistenceService.get('syncing')) {
        if (typeof persistenceService.cancel_sync === 'function') {
          persistenceService.cancel_sync();
        }
      }
    },
    sync() {
      const persistenceService = this.persistence;
      if (!persistenceService || typeof persistenceService.get !== 'function' || persistenceService.get('syncing')) {
        return;
      }
      if (typeof persistenceService.sync === 'function') {
        persistenceService.sync('self', true).then(null, function() {});
      }
    }
  },

  didInsertElement() {
  this._super(...arguments);
  var self = this;
    this.onClose = function() { self.send('close'); };
    this.onOpening = function() { self.send('opening'); };
    this.onClosing = function() { self.send('closing'); };
},

});
