import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { set as emberSet, get as emberGet } from '@ember/object';
import { computed } from '@ember/object';
import modal from '../utils/modal';

/**
 * Sync Details modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  persistence: service('persistence'),
  stashes: service('stashes'),
  appState: service('app-state'),
  session: service('session'),
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

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    toggle_statuses(sync) {
      emberSet(sync, 'toggled', !emberGet(sync, 'toggled'));
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
  }
});
