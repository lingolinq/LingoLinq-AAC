import Service from '@ember/service';
import EmberObject from '@ember/object';
import {
  later as runLater,
  debounce as runDebounce
} from '@ember/runloop';
import RSVP from 'rsvp';
import $ from 'jquery';
import LingoLinq from '../app';

/**
 * Modern Ember Service for Local Storage & Session State
 *
 * Replaces app/utils/_stashes.js with proper service pattern.
 * Handles:
 * - Local storage abstraction
 * - Session state management
 * - User preferences caching
 * - Usage logging
 */

var memory_stash = {};
var daily_event_types = ['models', 'modeled', 'remote_models', 'focus_words', 'eval', 'modeling_ideas', 'notes', 'quick_assessments', 'goals'];
var stash_capabilities = null;

export default Service.extend({
  // Properties
  prefix: 'cdStash-',
  memory_stash: memory_stash,
  enabled: false,

  // Initialize method replaces setup() from old util
  init() {
    this._super(...arguments);

    this.set('memory_stash', memory_stash);
    this.set('prefix', 'cdStash-');

    // Set up localStorage
    this._setupLocalStorage();

    // Set up defaults
    this._setupDefaults();

    // Set up user tracking
    this._setupUserTracking();
  },

  _setupLocalStorage() {
    try {
      for(var idx = 0, l = localStorage.length; idx < l; idx++) {
        var key = localStorage.key(idx);
        if(key && key.indexOf(this.prefix) === 0) {
          var real_key = key.replace(this.prefix, '');
          try {
            memory_stash[real_key] = JSON.parse(localStorage[key]);
            this.set(real_key, JSON.parse(localStorage[key]));
          } catch(e) { }
        }
      }
      localStorage[this.prefix + 'test'] = Math.random();
      this.set('enabled', true);
    } catch(e) {
      this.set('enabled', false);
      if(console.debug) {
        console.debug('LINGOLINQ: localStorage not working');
        console.debug(e);
      } else {
        console.log('LINGOLINQ: localStorage not working');
        console.log(e);
      }
    }
  },

  _setupDefaults() {
    var defaults = {
      'working_vocalization': [],
      'prior_utterances': [],
      'current_mode': 'default',
      'usage_log': [],
      'daily_use': [],
      'daily_events': {},
      'downloaded_voices': [],
      'boardHistory': [],
      'browse_history': [],
      'history_enabled': true,
      'root_board_state': null,
      'sidebar_enabled': false,
      'sticky_board': false,
      'remembered_vocalizations': [],
      'stashed_buttons': [],
      'ghost_utterance': false,
      'text_only_shares': false,
      'recent_boards': [],
      'logging_paused_at': null,
      'last_stream_id': null,
      'last_sync_status': null,
      'last_image_library': null,
      'last_image_library_at': null,
      'protected_user': false,
      'allow_local_filesystem_request': true,
      'display_lang': null,
      'label_locale': null,
      'override_label_locale': null,
      'last_root': null,
      'vocalization_locale': null,
      'override_vocalization_locale': null,
      'global_integrations': null,
      'prior_login': null,
      'ws_url': null,
      'ws_settings': null,
      'last_focus_words': null,
    };

    for(var idx in defaults) {
      var val = null;
      if(this.get('enabled')) {
        val = localStorage[this.prefix + idx] && JSON.parse(localStorage[this.prefix + idx]);
      }
      if(val === undefined || val === null) {
        val = defaults[idx];
      }
      this.set(idx, val);
      memory_stash[idx] = val;
    }
  },

  _setupUserTracking() {
    if(this.get('user_name')) {
      runLater(function() {
        if(this.get('user_name') && window.kvstash && window.kvstash.store) {
          window.kvstash.store('user_name', this.get('user_name'));
        }
      }.bind(this), 5000);
    }
  },

  /**
   * Connect to database
   * TODO: Migrate full implementation from utils/_stashes.js in Phase 2
   */
  db_connect(cap) {
    stash_capabilities = cap;
    if(!cap.dbman) { return RSVP.resolve(); }
    // ... rest will be migrated in Phase 2
    return RSVP.resolve();
  },

  /**
   * Persist key-value pair
   */
  persist(key, obj) {
    if(!key) { return; }
    this.persist_object(key, obj, true);
    this.set(key, obj);

    if(memory_stash[key] != obj) {
      memory_stash[key] = obj;
      runDebounce(this, this.db_persist, 500);
    }
  },

  /**
   * Persist object to storage
   */
  persist_object(key, obj, include_prefix) {
    this.persist_raw(key, JSON.stringify(obj), include_prefix);
    return RSVP.resolve();
    // Full implementation in Phase 2
  },

  /**
   * Persist to database
   */
  db_persist() {
    if(stash_capabilities && stash_capabilities.dbman) {
      var stringed_stash = {};
      for(var idx in memory_stash) {
        stringed_stash[idx] = JSON.stringify(memory_stash[idx]);
      }
      stringed_stash.storageId = 'stash';
      stash_capabilities.storage_store({store: 'settings', id: 'stash', record: stringed_stash});
    }
  },

  /**
   * Persist raw value
   */
  persist_raw(key, obj, include_prefix) {
    if(include_prefix) { key = this.prefix + key; }
    try {
      localStorage[key] = obj.toString();
    } catch(e) { }
  },

  /**
   * Get object from storage
   */
  get_object(key, include_prefix) {
    var res = null;
    try {
      res = JSON.parse(this.get_raw(key, include_prefix)) || this.get(key);
    } catch(e) { }
    return res;
  },

  /**
   * Get raw value from storage
   */
  get_raw(key, include_prefix) {
    if(include_prefix) { key = this.prefix + key; }
    var res = null;
    try {
      res = localStorage[key];
    } catch(e) { }
    return res;
  },

  /**
   * Flush storage
   */
  flush(prefix, ignore_prefix) {
    // Full implementation in Phase 2
    return RSVP.resolve();
  }

  // Additional methods will be added during full migration in Phase 2
});
