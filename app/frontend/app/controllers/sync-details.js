import EmberObject from '@ember/object';
import { set as emberSet, get as emberGet } from '@ember/object';
import modal from '../utils/modal';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';

export default modal.ModalController.extend({
  persistence: service('persistence'),
  stashes: service('stashes'),
  opening: function() {
    // Service is injected, no need to set it manually
  },
  details: computed(
    'persistence.sync_log',
    'persistence.sync_log.length',
    'persistence.sync_log.@each.status',
    function() {
      var persistenceService = this.persistence;
      if(!persistenceService || typeof persistenceService.get !== 'function') {
        return [];
      }
      var details = ([].concat(persistenceService.get('sync_log') || [])).reverse();
      (details || []).forEach(function(sync) {
        emberSet(sync, 'cached', sync.statuses.filter(function(s) { return s.status == 'cached'; }).length);
        emberSet(sync, 'downloaded', sync.statuses.filter(function(s) { return s.status == 'downloaded'; }).length);
        emberSet(sync, 're_downloaded', sync.statuses.filter(function(s) { return s.status == 're-downloaded'; }).length);
        sync.statuses.forEach(function(s, idx) { s.idx = idx; });
        emberSet(sync, 'sorted_statuses', sync.statuses.sort(function(a, b) {
          if(a.error && !b.error) {
            return -1;
          } else if(!a.error && b.error) {
            return 1;
          } else {
            return a.key.localeCompare(b.key);
            // return a.idx - b.idx;
          }        
        }));
        sync.statuses.forEach(function(s) {
          emberSet(s, (s.status || '').replace(/-/, '_'), true);
        });
      });
      return details;
    }
  ),
  refreshing_class: computed('persistence.syncing', function() {
    var res = "glyphicon glyphicon-refresh ";
    var persistenceService = this.persistence;
    if(persistenceService && typeof persistenceService.get === 'function' && persistenceService.get('syncing')) {
      res = res + "spinning ";
    }
    return res;
  }),
  first_log_date: computed('stashes.usage_log.length', function() {
    var log = this.stashes.get('usage_log')[0];
    if(log) {
      return new Date(log.timestamp * 1000);
    }
    return null;
  }),
  actions: {
    toggle_statuses: function(sync) {
      emberSet(sync, 'toggled', !emberGet(sync, 'toggled'));
    },
    cancel_sync: function() {
      var persistenceService = this.persistence;
      if(persistenceService && typeof persistenceService.get === 'function' && persistenceService.get('syncing')) {
        if(typeof persistenceService.cancel_sync === 'function') {
          persistenceService.cancel_sync();
        }
      }
    },
    sync: function() {
      var persistenceService = this.persistence;
      if(!persistenceService || typeof persistenceService.get !== 'function' || persistenceService.get('syncing')) {
        return;
      }
      console.debug('syncing because manually triggered');
      if(typeof persistenceService.sync === 'function') {
        persistenceService.sync('self', true).then(null, function() { });
      }
    },
  }
});
