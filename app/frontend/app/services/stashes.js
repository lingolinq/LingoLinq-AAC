import Service from '@ember/service';
import EmberObject from '@ember/object';
import {
  later as runLater,
  debounce as runDebounce
} from '@ember/runloop';
import RSVP from 'rsvp';
import $ from 'jquery';
import LingoLinq from '../app';

// NOTE: there is an assumption that each stashed value is independent and
// non-critical, so for example if one attribute got renamed it would not
// break anything, or affect any other value.
var memory_stash = {};
var daily_event_types = ['models', 'modeled', 'remote_models', 'focus_words', 'eval', 'modeling_ideas', 'notes', 'quick_assessments', 'goals'];
var stash_capabilities = null;

/**
 * Stashes Service - Modern service-based local storage management
 * 
 * This service replaces the deprecated implicit injection approach with
 * explicit @service injection. It provides local storage functionality
 * for the application.
 */
export default Service.extend({
  init() {
    this._super(...arguments);
    this.setup();
  },

  setup: function() {
    this.memory_stash = memory_stash;
    this.prefix = 'cdStash-';
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
    if(this.get('user_name')) {
      runLater(() => {
        if(this.get('user_name') && window.kvstash && window.kvstash.store) {
          window.kvstash.store('user_name', this.get('user_name'));
        }
      }, 5000);
    }
    if(this.get('global_integrations') && window.user_preferences) {
      window.user_preferences.global_integrations = this.get('global_integrations');
    } else if(!LingoLinq.testing) {
      runLater(() => {
        if(LingoLinq && LingoLinq.session && LingoLinq.session.check_token && !LingoLinq.testing) {
          LingoLinq.session.check_token();
        }
      }, 500);
    }
  },

  connect: function(application) {
    // Legacy method for backward compatibility during migration
    // Modern services don't need this - they're auto-registered
    stash_capabilities = null;
  },

  db_connect: function(cap) {
    // NOTE: this may be called before or after a call to stashes.setup
    stash_capabilities = cap;
    if(!cap.dbman) { return RSVP.resolve(); }
    return stash_capabilities.storage_find({store: 'settings', key: 'stash'}).then((stash) => {
      var count = 0;
      for(var idx in stash) {
        if(idx != 'raw' && idx != 'storageId' && idx != 'changed' && stash[idx] !== undefined) {
          memory_stash[idx] = JSON.parse(stash[idx]);
          if(this.get(idx) != memory_stash[idx]) {
            count++;
            this.set(idx, memory_stash[idx]);              
          }
        }
      }
      console.debug('LINGOLINQ: restoring stash from db, ' + count + ' values');
      return {};
    }, (err) => {
      console.debug('LINGOLINQ: db storage stashes not found');
      return RSVP.resolve();
    });
  },

  flush: function(prefix, ignore_prefix) {
    var full_prefix = this.prefix + (prefix || "");
    var full_ignore_prefix = ignore_prefix && (this.prefix + ignore_prefix);
    var promises = [];
    if((!prefix || prefix == 'auth_') && ignore_prefix != 'auth_') {
      promises.push(this.flush_db_id());
    }
    if(stash_capabilities && stash_capabilities.dbman) {
      var stash = {};
      stash.storageId = 'stash';
      promises.push(stash_capabilities.storage_store({store: 'settings', id: 'stash', record: stash}));
    }
    for(var idx = 0; idx < localStorage.length; idx++) {
      var key = localStorage.key(idx);
      if(key && key.indexOf(full_prefix) === 0) {
        if(ignore_prefix && key.indexOf(full_ignore_prefix) === 0) {
        } else if(key && key.match(/usage_log/)) {
          // don't flush the usage_log
        } else {
          try {
            this.set(key.replace(this.prefix, ''), undefined);
            delete memory_stash[key.replace(this.prefix, '')];
            localStorage.removeItem(key);
            idx = -1;
          } catch(e) { }
        }
      }
    }
    var defer = RSVP.defer();
    var done = false;
    RSVP.all_wait(promises).then(() => { done = true; defer.resolve(); }, () => { done = true; defer.resolve(); });
    runLater(() => {
      if(!done) { console.error("failed to flush stash"); defer.resolve(); }
    }, 1500);
    return defer.promise;
  },

  db_persist: function() {
    if(stash_capabilities && stash_capabilities.dbman) {
      var stringed_stash = {};
      for(var idx in memory_stash) {
        stringed_stash[idx] = JSON.stringify(memory_stash[idx]);
      }
      stringed_stash.storageId = 'stash';
      // I intended for this to be a fallback in case localStorage data got lost
      // somehow, which is why the db id is also being stored in the cookie
      // as a fallback for the db id which is usually kept in localStorage.
      stash_capabilities.storage_store({store: 'settings', id: 'stash', record: stringed_stash});
    }
  },

  persist: function(key, obj) {
    if(!key) { return; }
    this.persist_object(key, obj, true);
    this.set(key, obj);

    if(memory_stash[key] != obj) {
      memory_stash[key] = obj;
      runDebounce(this, this.db_persist, 500);
    }
  },

  persist_object: function(key, obj, include_prefix) {
    var _this = this;
    this.persist_raw(key, JSON.stringify(obj), include_prefix);
    var defer = RSVP.defer();
    var done = false;
    if(key == 'auth_settings' && obj.user_name) {
      // Setting the cookie is a last-resort fallback to try not to lose user information
      // unnecessarily. We probably don't actually need it, but that's why it's here.
      // Don't set a cookie unless explicitly authorized, or in an installed app (where it shouldn't be sent anyway)
      if(localStorage['enable_cookies'] == 'true' || (stash_capabilities && stash_capabilities.installed_app)) {
        document.cookie = "authDBID=" + obj.user_name;
      }
      if(window.kvstash && window.kvstash.store) {
        window.kvstash.store('user_name', obj.user_name);
      }
      if(stash_capabilities && stash_capabilities.installed_app) {
        var data_uri = "data:text/json;base64," + btoa(JSON.stringify({ db_id: obj.user_name, filename: "db_stats.json" }));
        var blob = stash_capabilities.data_uri_to_blob(data_uri);
        stash_capabilities.storage.write_file('json', 'db_stats.json', blob).then((res) => {
          console.log("LINGOLINQ: db_stats persisted!");
          done = true;
          defer.resolve();
        }, () => { console.error("LINGOLINQ: db_stats failed.."); defer.resolve(); });
      } else {
        done = true;
        defer.resolve();
      }
    } else {
      done = true;
      defer.resolve();
    }
    runLater(() => {
      // Prevent blocking on unexpected unresolve
      if(!done) { console.error("failed to persist auth settings"); defer.resolve(); }
    }, 500);
    return defer.promise;
  },

  flush_db_id: function() {
    var defer = RSVP.defer();
    document.cookie = 'authDBID=';
    if(window.kvstash && window.kvstash.remove) {
      window.kvstash.remove('user_name');
    }
    var done = false;
    if(stash_capabilities && stash_capabilities.installed_app) {
      stash_capabilities.storage.remove_file('json', 'db_stats.json').then(() => {
        done = true;
        defer.resolve();
      }, () => { done = true; defer.resolve(); });
    } else {
      done = true;
      defer.resolve();
    }
    runLater(() => {
      if(!done) { console.error("failed to flush db id"); defer.resolve(); }
    }, 500);
    return defer.promise;
  },

  persist_raw: function(key, obj, include_prefix) {
    if(include_prefix) { key = this.prefix + key; }
    try {
      localStorage[key] = obj.toString();
    } catch(e) { }
  },

  get_object: function(key, include_prefix) {
    var res = null;
    try {
      res = JSON.parse(this.get_raw(key, include_prefix)) || this.get(key);
    } catch(e) { }
    return res;
  },

  get_db_id: function(cap) {
    var auth_settings = this.get_object('auth_settings', true);
    if(auth_settings) {
      return RSVP.resolve({ db_id: auth_settings.user_name });
    } else {
      var keys = (document.cookie || "").split(/\s*;\s*/);
      var key = keys.find((k) => k.match(/^authDBID=/));
      var user_name = key && key.replace(/^authDBID=/, '');
      if(user_name) {
        return RSVP.resolve({ db_id: user_name });
      } else if(this.fs_user_name) {
        return RSVP.resolve({ db_id: this.fs_user_name });
      } else if(cap && cap.installed_app) {
        // try file-system lookup, fall back to kvstash I guess
        var defer = RSVP.defer();
        var done = false;
        var lookup = cap.storage.get_file_url('json', 'db_stats.json').then((local_url) => {
          var local_url = cap.storage.fix_url(local_url);
          if(typeof(capabilities) == 'string' && window.persistence) {
            return window.persistence.ajax(local_url, {type: 'GET', dataType: 'json'});
          } else {
            return {};
          }
        });
        lookup.then((json) => {
          this.fs_user_name = json.db_id;
          done = true;
          defer.resolve({ db_id: json.db_id });
        }, () => {
          if(window.kvstash && window.kvstash.values && window.kvstash.values.user_name) {
            done = true;
            defer.resolve({ db_id: window.kvstash.values.user_name });
          } else {
            done = true;
            defer.resolve({db_id: null});
          }
        });
        runLater(() => {
          if(!done) { console.error("failed to retrieve db id"); defer.resolve({db_id: null}); }
        }, 1000);

        return defer.promise;
      } else {
        return RSVP.resolve({db_id: null});
      }
    }
  },

  get_db_key: function(persist) {
    var key = this.get_raw('cd_db_key');
    if(persist) {
      key = key || ("db2_" + Math.random().toString() + "_" + (new Date()).getTime().toString());
      this.persist_raw('cd_db_key', key);
    }
    return key
  },

  db_settings: function(cap) {
    var db_key = this.get_db_key();
    return this.get_db_id(cap).then((res) => {
      return {
        db_id: res.db_id, 
        db_key: res.db_key || db_key
      }
    });
  },

  get_raw: function(key, include_prefix) {
    if(include_prefix) { key = this.prefix + key; }
    var res = null;
    try {
      res = localStorage[key];
    } catch(e) { }
    return res;
  },

  geo: {
    poll: function() {
      if(navigator && navigator.geolocation) { 
        // Access via service instance
        if(window.stashes && window.stashes.geolocation) {
          window.stashes.geolocation = navigator.geolocation;
        }
      }
      var go = function() {
        var stashesService = window.stashes;
        if(stashesService && stashesService.geolocation && !LingoLinq.embedded) {
          if(stashesService.geo && stashesService.geo.watching) {
            stashesService.geolocation.clearWatch(stashesService.geo.watching);
          }
          stashesService.geolocation.getCurrentPosition((position) => {
            stashesService.set('geo.latest', position);
          });
          if(!stashesService.geo) { stashesService.geo = {}; }
          stashesService.geo.watching = stashesService.geolocation.watchPosition((position) => {
            stashesService.set('geo.latest', position);
          }, (error) => {
            stashesService.set('geo.latest', null);
          });
        }
      };
      if(stash_capabilities) {
        stash_capabilities.permissions.assert('geolocation').then(() => { go(); });
      } else {
        go();
      }
    }
  },

  remember: function(opts) {
    opts = opts || {};
    if(!this.get('history_enabled')) { return; }
    // TODO: this should be persisted server-side
    var list = this.get('remembered_vocalizations');
    var voc = opts.override || this.get('working_vocalization') || [];
    if(voc.length === 0) { return; }
    var obj = {
      vocalizations: voc,
      stash: !!opts.stash
    };
    obj.sentence = obj.vocalizations.map((v) => v.label).join(" ");
    if(!list.find((v) => v.sentence == obj.sentence)) {
      list.pushObject(obj);
    }
    this.persist('remembered_vocalizations', list);
  },

  current_timestamp: function() {
    return Date.now() / 1000;
  },

  notify_observers(button) {
    if(window.parent && window.parent != window && LingoLinq.embedded) {
      window.parent.postMessage({
        type: 'aac_event',
        aac_type: 'button',
        text: button.vocalization || button.label,
        sentence: this.get('working_vocalization').map((b) => b.vocalization || b.label).join(" ")
      }, '*');
    }
  },

  track_daily_event: function(type, n) {
    if(n == null) { n = 1; }
    if(daily_event_types.includes(type)) {
      var events = this.get('daily_events') || {};
      var today = window.moment().toISOString().substring(0, 10);
      events[today] = events[today] || {};
      if((type == 'models' || type == 'remote_models') && typeof(n) == 'string') {
        events[today]['modeled'] = (events[today]['modeled'] || []).concat(n.split(/\s+/));
        n = 1;
      }
      events[today][type] = (events[today][type] || 0) + n;
      this.persist('daily_events', events);
    }
  },

  log_event: function(obj, user_id, session_user_id) {
    var timestamp = this.current_timestamp();
    var geo = null;
    if(this.geo && this.get('geo.latest') && this.get('geo_logging_enabled')) { // TODO: timeout if it's been too long?
      geo = [this.get('geo.latest').coords.latitude, this.get('geo.latest').coords.longitude, this.get('geo.latest').coords.altitude];
    }
    var log_event = null;
    var usage_log = this.get('usage_log');
    if(obj && user_id) {
      if(obj.buttons) {
        log_event = {
          type: 'utterance',
          timestamp: timestamp,
          user_id: user_id,
          geo: geo,
          utterance: obj
        };
      } else if(obj.button_id) {
        log_event = {
          type: 'button',
          timestamp: timestamp,
          user_id: user_id,
          geo: geo,
          button: obj
        };
        this.notify_observers(obj);
      } else if(obj.tallies) {
        log_event = {
          type: 'assessment',
          timestamp: timestamp,
          user_id: user_id,
          geo: geo,
          assessment: obj
        };
      } else if(obj.mastery_cutoff) {
        log_event = {
          type: 'eval',
          timestamp: timestamp,
          user_id: user_id,
          geo: geo,
          eval: obj
        };
      } else if(obj.score_categories || obj.report_segments) {
        log_event = {
          type: 'profile',
          timestamp: timestamp,
          user_id: user_id,
          geo: geo,
          profile: obj
        };
      } else if(obj.note) {
        log_event = {
          type: 'note',
          timestamp: timestamp,
          user_id: user_id,
          geo: geo,
          note: obj.note
        };
      } else if(obj.share) {
        log_event = {
          type: 'share',
          timestamp: timestamp,
          user_id: user_id,
          share: obj
        };
      } else if(obj.alert) {
        log_event = {
          type: 'alert',
          timestamp: timestamp,
          user_id: user_id,
          alert: obj.alert
        };
      } else if(obj.modeling_activity_id) {
        log_event = {
          type: 'modeling_activity',
          timestamp: timestamp,
          user_id: user_id,
          activity: obj
        };
      } else if(obj.error) {
        log_event = {
          type: 'error',
          timestamp: timestamp,
          user_id: user_id,
          error: obj.error
        }
      } else {
        log_event = {
          type: 'action',
          timestamp: timestamp,
          user_id: user_id,
          geo: geo,
          action: obj
        };
        if(obj.button_triggered) {
          log_event.button_triggered = true;
        }
      }
      if(stash_capabilities) {
        log_event.system = stash_capabilities.system;
        log_event.browser = stash_capabilities.browser;
      }
      if(this.orientation) {
        log_event.orientation = this.orientation;
      }
      if(this.volume !== null && this.volume !== undefined) {
        log_event.volume = this.volume;
      }
      if(this.ambient_light !== null && this.ambient_light !== undefined) {
        log_event.ambient_light = this.ambient_light;
      }
      if(this.screen_brightness) {
        log_event.screen_brightness = this.screen_brightness;
      }
      if(this.get('modeling') || (log_event.button && log_event.button.modeling)) {
        log_event.modeling = true;
      } else if(this.last_selection && this.last_selection.modeling && this.last_selection.ts > ((new Date()).getTime() - 500)) {
        log_event.modeling = true;
      }
      if(log_event.modeling && session_user_id && session_user_id != user_id) {
        log_event.session_user_id = session_user_id;
      }
      log_event.window_width = window.outerWidth;
      log_event.window_height= window.outerHeight;

      if(log_event) {
        this.last_id = this.last_id || 1;
        if(this.last_id > 50000) { this.last_id = 1; }
        this.id_seed = this.id_seed || Math.floor(Math.random() * 10);
        // setting ids client-side may help me troubleshoot how
        // they potentially get out of order in the logs
        log_event.id = (this.last_id++ * 10) + this.id_seed;
        this.persist('last_event', log_event);
        usage_log.push(log_event);
      }
    }
    this.persist('usage_log', usage_log);
    this.push_log(true);
    return log_event;
  },

  track_daily_use: function() {
    var now = (new Date()).getTime();
    var today = window.moment().toISOString().substring(0, 10);
    var daily_use = this.get('daily_use') || [];
    var found = false;
    var daily_events = this.get('daily_events') || {}
    daily_use.forEach((d) => {
      if(daily_events[d.date]) {
        daily_event_types.forEach((t) => {
          d[t] = daily_events[d.date][t];
        })
        for(var key in daily_events[d.date]) {
          if(daily_events[d.date][key] != null) {
            d[key] = daily_events[d.date][key];
          }
        }
      }
      if(d.date == today) {
        found = d;
        // if it's been less than 5 minutes since the last event, add the difference
        // to the total minutes for the day, otherwise just say we've had a teeny
        // bit of activity.
        if(now - d.last_timestamp < (5 * 60 * 1000)) {
          d.total_minutes = (d.total_minutes || 0) + ((now - d.last_timestamp) / (60 * 1000));
        } else {
          d.total_minutes = (d.total_minutes || 0) + 0.25;
        }
        d.last_timestamp = now;
      }
    });
    if(!found) {
      daily_use.push({
        date: today,
        last_timestamp: now,
        total_minutes: 0.25,
        recorded_minutes: 0,
      });
    }
    this.persist('daily_use', daily_use);
    // once we have data for more than one day, or at least 10 new minutes of usage, push it and then clear the history
    var do_push = daily_use.length > 1 || (found && (found.total_minutes - found.recorded_minutes) > 10);
    if(daily_use.length > 1 && this.get('online')) {
      if(found) {
        found.recorded_minutes = found.total_minutes;
      }
      var days = [];
      daily_use.forEach((d) => {
        var level = 0;
        if(d.total_minutes >= 60) { level = 5; }
        else if(d.total_minutes >= 30) { level = 4; }
        else if(d.total_minutes >= 15) { level = 3; }
        else if(d.total_minutes >= 5) { level = 2; }
        else if(d.total_minutes > 0) { level = 1; }
        var rec = {
          date: d.date,
          activity_level: level,
          active: d.total_minutes >= 30
        }
        daily_event_types.forEach((t) => {
          if(d[t] != null) {
            rec[t] = d[t];
          }
        });
        days.push(rec);
      });
      // ajax call to push daily_use data
      var log = LingoLinq.store.createRecord('log', {
        type: 'daily_use',
        events: days
      });
      log.save().then(() => {
        // clear the old days that have been persisted
        var dailies = this.get('daily_use') || [];
        dailies = dailies.filter((d) => d.date == today);
        this.persist('daily_use', dailies);
      }, () => { });
    }
  },

  log: function(obj) {
    this.track_daily_use();
    if(obj && obj.button_id) {
      var modeling = false;
      if(this.get('modeling') || (obj && obj.modeling)) {
        modeling = true;
      } else if(this.last_selection && this.last_selection.modeling && this.last_selection.ts > ((new Date()).getTime() - 500)) {
        modeling = true;
      }
      var phrase = null;
      if((obj.add_vocalization || obj.add_vocalization == null) && window.app_state && window.app_state.get('currentUser.supporter_role') && (this.get('logging_enabled') || window.app_state.get('currentUser.supervised_units.length'))) {
        // unit supervisors and those with logging enabled 
        // with have their models explicitly tracked for reporting
        phrase = obj.vocalization || obj.label;
      }
      this.track_daily_event('models', phrase);
    }
    if(!this.get('history_enabled')) { return null; }
    if(!this.get('logging_enabled')) { return null; }
    if(window.app_state && window.app_state.get('eval_mode')) { return null; }
    if(this.get('logging_paused_at')) {
      var last_event = this.get('last_event');
      var pause = this.get('logging_paused_at');
      var sixty_minutes_ago = (new Date()).getTime() - (60 * 60 * 1000);
      var six_hours_ago = (new Date()).getTime() - (6 * 60 * 60 * 1000);
      if(last_event && last_event.timestamp > pause && last_event < sixty_minutes_ago) {
//         modal.warning(i18n.t('logging_resumed_inactivity', "Logging has resumed automatically after at least an hour of inactivity"));
        if(this.controller) {
          this.controller.set('logging_paused_at', null);
        }
        this.persist('logging_paused_at', null);
      } else if(last_event && last_event.timestamp > pause && last_event < six_hours_ago) {
//         modal.warning(i18n.t('logging_resumed_pause_expired', "Logging has resumed automatically after being paused for over six hours"));
        if(this.controller) {
          this.controller.set('logging_paused_at', null);
        }
        this.persist('logging_paused_at', null);
      } else {
        this.persist('last_event', {timestamp: (new Date()).getTime()});
        return null;
      }
    }
    var user_id = this.get('speaking_user_id');
    if(this.get('referenced_speak_mode_user_id')) {
      user_id = this.get('referenced_speak_mode_user_id');
    }
    return this.log_event(obj, user_id, this.get('session_user_id'));
  },

  push_log: function(only_if_convenient) {
    var usage_log = this.get('usage_log');
    var timestamp = this.current_timestamp();
    // Wait at least 10 seconds between log pushes
    if(this.last_log_push && timestamp - this.last_log_push < 10) {
      if(!this.wait_timer) {
        this.wait_timer = runLater(() => {
          this.wait_timer = null;
          this.push_log();
        }, 8000);  
      }
      return;
    }
    // Remove from local store and persist occasionally
    var diff = (usage_log && usage_log[0] && usage_log[0].timestamp) ? (timestamp - usage_log[0].timestamp) : -1;
    // If log pushes have been failing, don't keep trying on every button press
    var wait_on_error = this.errored_at && this.errored_at > 10 && ((timestamp - this.errored_at) < (2 * 60));
    // TODO: add listener on persistence.online and trigger this log save stuff when reconnected
    if(LingoLinq.session && LingoLinq.session.get('isAuthenticated') && this.get('online') && usage_log.length > 0 && !wait_on_error) {
      // If there's more than 50 events, or it's been more than 30 minutes
      // since the last recorded event.
      if(usage_log.length > 50 || diff == -1 || diff > (30 * 60 * 1000) || !only_if_convenient) {
        var history = [].concat(usage_log);
        // If there are tons of events, break them up into smaller chunks, this may
        // be why user logs stopped getting persisted for one user's device.
        var to_persist = history.slice(0, 250);
        var for_later = history.slice(250,  history.length);
        this.persist('usage_log', [].concat(for_later));
        var log = LingoLinq.store.createRecord('log', {
          events: to_persist
        });
        log.cleanup();
        this.last_log_push = timestamp;
        log.save().then(() => {
          this.errored_at = null;
          if(for_later.length > 0) {
            runLater(() => {
              this.push_log();
            }, 10000);
          }
          // success!
        }, (err) => {
          // error, try again later
          if(!this.errored_at || this.errored_at <= 2) {
//             this.persist('usage_log', to_persist.concat(this.get('usage_log')));
            this.errored_at = (this.errored_at || 0) + 1;
          } else {
//             this.set('big_logs', (this.get('big_logs') || []).concat([to_persist]));
            this.errored_at = this.current_timestamp();
          }
          console.log(err);
          console.error("log push failed");
          this.persist('usage_log', to_persist.concat(this.get('usage_log')));
        });
      }
    }
    if(!this.timer) {
      this.timer = runLater(() => {
        this.timer = null;
        this.push_log(only_if_convenient);
      }, 15 * 60 * 1000);
    }
  }
});
