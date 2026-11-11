import Service from '@ember/service';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import { addObserver, removeObserver } from '@ember/object/observers';
import i18n from '../utils/i18n';

/**
 * State for the sync drawer (<SyncProgressDrawer />, mounted from application.hbs so it survives route
 * transitions), modelled on the board-copy drawer (services/copy-progress.js). Item 8, PR #1268, Traci
 * 2026-11-11: a running sync shows a message bottom right on every page; when it ends, a result card.
 *
 * The sync itself runs in the persistence service; this service only follows its `sync_status`:
 * 'syncing' opens the drawer, and the first settled status after it ('succeeded', 'finished' or 'failed')
 * turns the drawer into the result card. A sync of another user's database (an open database that is not
 * the signed-in user's) shows nothing, as the Modern home page's failed-sync notice does.
 *
 * The result card waits to be dismissed except after a clean success, which goes away on its own: automatic
 * syncs succeed many times a day and a card that needs answering each time would be noise; a failure or a
 * sync with problems is worth an answer.
 */
export var SUCCESS_CARD_MS = 8000;

export default Service.extend({
  persistence: service('persistence'),
  // 'syncing' | 'done' | null (nothing to show)
  status: null,
  // The settled status the card reports: 'succeeded' | 'finished' | 'failed'
  kind: null,
  _success_timer: null,

  // The sync writes its status first and the details after it (services/persistence.js:2400 sets 'finished'
  // and :2404 the problem count; :2442 sets 'failed' and :2455-2459 the reason, as does
  // utils/storage_failures.js:33-35), and the observer runs inside the first of those writes. So the card's
  // text is computed from the live fields when it is read, never copied at the moment the status changed.
  message: computed('kind', 'persistence.sync_errors', function() {
    var kind = this.get('kind');
    if(kind === 'succeeded') { return i18n.t('sync_drawer_succeeded', "Your boards are synced and ready for offline use."); }
    if(kind === 'finished') { return i18n.t('sync_drawer_finished', "Boards synced. %{n} had a problem.", { n: this.get('persistence.sync_errors') || 0 }); }
    if(kind === 'failed') { return i18n.t('sync_drawer_failed', "Sync failed. Some boards may not be ready to use offline."); }
    return null;
  }),
  detail: computed('kind', 'persistence.sync_status_error', function() {
    return this.get('kind') === 'failed' ? (this.get('persistence.sync_status_error') || null) : null;
  }),

  init() {
    this._super(...arguments);
    this._last_sync_status = this.get('persistence.sync_status');
    addObserver(this.get('persistence'), 'sync_status', this, this._sync_status_changed);
    if(this._last_sync_status === 'syncing') { this._sync_status_changed(); }
  },

  willDestroy() {
    removeObserver(this.get('persistence'), 'sync_status', this, this._sync_status_changed);
    this._clear_timer();
    this._super(...arguments);
  },

  is_syncing: computed('status', function() { return this.get('status') === 'syncing'; }),
  is_done: computed('status', function() { return this.get('status') === 'done'; }),
  is_success: computed('kind', function() { return this.get('kind') === 'succeeded'; }),

  _sync_status_changed() {
    var p = this.get('persistence');
    var now = p.get('sync_status');
    var before = this._last_sync_status;
    this._last_sync_status = now;
    if(now === 'syncing') {
      if(typeof p.local_db_is_current_user === 'function' && !p.local_db_is_current_user()) { return; }
      this._clear_timer();
      this.setProperties({ status: 'syncing', kind: null });
      return;
    }
    if(before !== 'syncing' || this.get('status') !== 'syncing') { return; }
    if(now === 'succeeded') {
      this.setProperties({ status: 'done', kind: 'succeeded' });
      var _this = this;
      this._success_timer = setTimeout(function() { _this._success_timer = null; if(_this.get('kind') === 'succeeded') { _this.dismiss(); } }, SUCCESS_CARD_MS);
    } else if(now === 'finished') {
      this.setProperties({ status: 'done', kind: 'finished' });
    } else if(now === 'failed' && !p.get('root_sync_canceled')) {
      // A sync the user cancelled also ends as failed (cancel_sync sets root_sync_canceled first,
      // services/persistence.js:4900); they stopped it, so it is not reported, as on the Modern home page.
      this.setProperties({ status: 'done', kind: 'failed' });
    } else {
      // Cancelled, or reset without a result: nothing to report.
      this.dismiss();
    }
  },

  dismiss() {
    this._clear_timer();
    this.setProperties({ status: null, kind: null });
  },

  _clear_timer() {
    if(this._success_timer) { clearTimeout(this._success_timer); this._success_timer = null; }
  }
});
