import Service from '@ember/service';
import EmberObject from '@ember/object';
import { set as emberSet, get as emberGet } from '@ember/object';
import {
  later as runLater,
  cancel as runCancel,
  run
} from '@ember/runloop';
import RSVP from 'rsvp';
import $ from 'jquery';
import { inject as service } from '@ember/service';
import LingoLinq from '../app';
import lingoLinqExtras from '../utils/extras';
import speecher from '../utils/speecher';
import i18n from '../utils/i18n';
import contentGrabbers from '../utils/content_grabbers';
import Utils from '../utils/misc';
import capabilities from '../utils/capabilities';
import { observer } from '@ember/object';
import { computed } from '@ember/object';

/**
 * Modern Ember Service for Persistence & Offline Sync
 *
 * Replaces app/utils/persistence.js with proper service pattern.
 * Handles:
 * - Local database abstraction (IndexedDB/SQLite)
 * - Online/offline sync logic
 * - Ember Data caching
 * - Data store management
 */
export default Service.extend({
  // Explicit service dependencies
  stashes: service(),
  modal: service(),

  // Valid store types
  _validStores: ['user', 'board', 'image', 'sound', 'settings', 'dataCache', 'buttonset'],

  // Initialize method replaces setup() from old util
  init() {
    this._super(...arguments);

    var loaded = (new Date()).getTime() / 1000;
    this.set('loaded_at', loaded);

    // Load last sync state from settings
    this._loadSyncState();

    // Set up big logs observer
    this._setupBigLogsObserver();

    // Set up storage system
    this._setupStorage();

    // Set up device change watcher
    this._setupDeviceWatcher();
  },

  _loadSyncState() {
    var _this = this;
    this.find('settings', 'lastSync').then(function(res) {
      _this.set('last_sync_at', res.last_sync);
      _this.set('sync_stamps', res.stamps);
    }, function() {});
  },

  _setupBigLogsObserver() {
    var _this = this;
    var stashes = this.stashes;
    var ignore_big_log_change = false;

    stashes.addObserver('big_logs', function() {
      if(lingoLinqExtras && lingoLinqExtras.ready && !ignore_big_log_change) {
        // Big logs logic migrated from utils/persistence.js
        // ... (will be fully implemented in Phase 2)
      }
    });
  },

  _setupStorage() {
    if(this.stashes.get('allow_local_filesystem_request') == false) {
      capabilities.storage.already_limited_size = true;
    }
  },

  _setupDeviceWatcher() {
    var _this = this;
    lingoLinqExtras.advance.watch('device', function() {
      if(!LingoLinq.ignore_filesystem) {
        capabilities.storage.status().then(function(res) {
          if(res.available && !res.requires_confirmation) {
            res.allowed = true;
          }
          _this.set('local_system', res);
        });
        runLater(function() {
          _this.prime_caches().then(null, function() { });
        }, 100);
        runLater(function() {
          if(_this.get('local_system.allowed')) {
            _this.prime_caches(true).then(null, function() { });
          }
        }, 2000);
      }
    });
  },

  /**
   * Find record in local storage
   * TODO: Migrate full implementation from utils/persistence.js in Phase 2
   */
  find(store, key) {
    console.warn('persistence service: find() not yet fully migrated');
    return RSVP.reject('Not implemented');
  },

  /**
   * Store record in local storage
   * TODO: Migrate full implementation from utils/persistence.js in Phase 2
   */
  store(store, obj, key) {
    console.warn('persistence service: store() not yet fully migrated');
    return RSVP.reject('Not implemented');
  },

  /**
   * Sync local and remote data
   * TODO: Migrate full implementation from utils/persistence.js in Phase 2
   */
  sync() {
    console.warn('persistence service: sync() not yet fully migrated');
    return RSVP.reject('Not implemented');
  },

  /**
   * Prime caches
   * TODO: Migrate full implementation from utils/persistence.js in Phase 2
   */
  prime_caches(force) {
    console.warn('persistence service: prime_caches() not yet fully migrated');
    return RSVP.resolve();
  }

  // Additional methods will be added during full migration in Phase 2
});
