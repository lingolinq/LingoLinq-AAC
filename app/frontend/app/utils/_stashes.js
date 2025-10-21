import Ember from 'ember';
import EmberObject from '@ember/object';
import {
  later as runLater,
  debounce as runDebounce
} from '@ember/runloop';
import RSVP from 'rsvp';
import $ from 'jquery';
import LingoLinqAAC from '../app';

// NOTE: there is an assumption that each stashed value is independent and
// non-critical, so for example if one attribute got renamed it would not
// break anything, or affect any other value.
var memory_stash = {};
var daily_event_types = ['models', 'modeled', 'remote_models', 'focus_words', 'eval', 'modeling_ideas', 'notes', 'quick_assessments', 'goals'];
var stash_capabilities = null;
var stashes = EmberObject.extend({
  connect: function(application) {
    application.register('cough_drop:stashes', stashes, { instantiate: false, singleton: true });
    $.each(['model', 'controller', 'view', 'route'], function(i, component) {
      application.inject(component, 'stashes', 'cough_drop:stashes');
    });
  },
  db_connect: function(cap) {
    // NOTE: this may be called before or after a call to stashes.setup
    stash_capabilities = cap;
    if(!cap.dbman) { return RSVP.resolve(); }
    return stash_capabilities.storage_find({store: 'settings', key: 'stash'}).then(function(stash) {
      var count = 0;
      for(var idx in stash) {
        if(idx != 'raw' && idx != 'storageId' && idx != 'changed' && stash[idx] !== undefined) {
          memory_stash[idx] = JSON.parse(stash[idx]);
          if(stashes.get(idx) != memory_stash[idx]) {
            count++;
            stashes.set(idx, memory_stash[idx]);              
          }
        }
      }
      console.debug('LINGOLINQ-AAC: restoring stash from db, ' + count + ' values');
      return {};
    }, function(err) {
      console.debug('LINGOLINQ-AAC: db storage stashes not found');
      return RSVP.resolve();
    });
  },
  setup: function() {
    stashes.memory_stash = memory_stash;
    stashes.prefix = 'cdStash-';
    try {
      for(var idx = 0, l = localStorage.length; idx < l; idx++) {
        var key = localStorage.key(idx);
        if(key && key.indexOf(stashes.prefix) === 0) {
          var real_key = key.replace(stashes.prefix, '');
          try {
            memory_stash[real_key] = JSON.parse(localStorage[key]);
            stashes.set(real_key, JSON.parse(localStorage[key]));
          } catch(e) { }
        }
      }
      localStorage[stashes.prefix + 'test'] = Math.random();
      stashes.set('enabled', true);
    } catch(e) {
      stashes.set('enabled', false);
      if(console.debug) {
        console.debug('LINGOLINQ-AAC: localStorage not working');
        console.debug(e);
      } else {
        console.log('LINGOLINQ-AAC: localStorage not working');
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
      if(stashes.get('enabled')) {
        val = localStorage[stashes.prefix + idx] && JSON.parse(localStorage[stashes.prefix + idx]);
      }
      if(val === undefined || val === null) {
        val = defaults[idx];
      }
      stashes.set(idx, val);
      memory_stash[idx] = val;
    }
    if(stashes.get('user_name')) {
      runLater(function() {
        if(stashes.get('user_name') && window.kvstash && window.kvstash.store) {
          window.kvstash.store('user_name', stashes.get('user_name'));
        }
      }, 5000);
    }
    if(stashes.get('global_integrations') && window.user_preferences) {
      window.user_preferences.global_integrations = stashes.get('global_integrations');
    } else if(!Ember.testing) {
      runLater(function() {
        if(LingoLinqAAC && LingoLinqAAC.session && LingoLinqAAC.session.check_token && !LingoLinqAAC.testing) {
          LingoLinqAAC.session.check_token();
        }
      }, 500);
    }
  },
  flush: function(prefix, ignore_prefix) {
    var full_prefix = stashes.prefix + (prefix || "");
    var full_ignore_prefix = ignore_prefix && (stashes.prefix + ignore_prefix);
    var promises = [];
    if((!prefix || prefix == 'auth_') && ignore_prefix != 'auth_') {
      promises.push(stashes.flush_db_id());
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
            stashes.set(key.replace(stashes.prefix, ''), undefined);
            delete memory_stash[key.replace(stashes.prefix, '')];
            localStorage.removeItem(key);
            idx = -1;
          } catch(e) { }
        }
      }
    }
    var defer = RSVP.defer();
    var done = false;
    RSVP.all_wait(promises).then(function() { done = true; defer.resolve(); }, function() { done = true; defer.resolve(); });
    runLater(function() {
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
    stashes.set(key, obj);

    if(memory_stash[key] != obj) {
      memory_stash[key] = obj;
      runDebounce(this, this.db_persist, 500);
    }
  },
  persist_object: function(key, obj, include_prefix) {
    var _this = this;
    stashes.persist_raw(key, JSON.stringify(obj), include_prefix);
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
        stash_capabilities.storage.write_file('json', 'db_stats.json', blob).then(function(res) {
          console.log("LINGOLINQ-AAC: db_stats persisted!");
          done = true;
          defer.resolve();
        }, function() { console.error("LINGOLINQ-AAC: db_stats failed.."); defer.resolve(); });
      } else {
        done = true;
        defer.resolve();
      }
    } else {
      done = true;
      defer.resolve();
    }
    runLater(function() {
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
      stash_capabilities.storage.remove_file('json', 'db_stats.json').then(function() {
        done = true;
        defer.resolve();
      }, function() { done = true; defer.resolve(); });
    } else {
      done = true;
      defer.resolve();
    }
    runLater(function() {
      if(!done) { console.error("failed to flush db id"); defer.resolve(); }
    }, 500);
    return defer.promise;
  },
  persist_raw: function(key, obj, include_prefix) {
    if(include_prefix) { key = stashes.prefix + key; }
    try {
      localStorage[key] = obj.toString();
    } catch(e) { 
      console.error("LingoLinqAAC: Failed to persist to localStorage", { key: key, error: e });
    }
  },
  get_object: function(key, include_prefix) {
    var res = null;
    try {
      res = JSON.parse(stashes.get_raw(key, include_prefix)) || this.get(key);
    } catch(e) { }
    return res;
  },
  get_db_id: function(cap) {
    var auth_settings = stashes.get_object('auth_settings', true);
    if(auth_settings) {
      return RSVP.resolve({ db_id: auth_settings.user_name });
    } else {
      var keys = (document.cookie || "").split(/\s*;\s*/);
      var key = keys.find(function(k) { return k.match(/^authDBID=/); });
      var user_name = key && key.replace(/^authDBID=/, '');
      if(user_name) {
        return RSVP.resolve({ db_id: user_name });
      } else if(stashes.fs_user_name) {
        return RSVP.resolve({ db_id: stashes.fs_user_name });
      } else if(cap && cap.installed_app) {
        // try file-system lookup, fall back to kvstash I guess
        var defer = RSVP.defer();
        var done = false;
        var lookup = cap.storage.get_file_url('json', 'db_stats.json').then(function(local_url) {
          var local_url = cap.storage.fix_url(local_url);
          if(typeof(capabilities) == 'string' && window.persistence) {
            return window.persistence.ajax(local_url, {type: 'GET', dataType: 'json'});
          } else {
            return {};
          }
        });
        lookup.then(function(json) {
          stashes.fs_user_name = json.db_id;
          done = true;
          defer.resolve({ db_id: json.db_id });
        }, function() {
          if(window.kvstash && window.kvstash.values && window.kvstash.values.user_name) {
            done = true;
            defer.resolve({ db_id: window.kvstash.values.user_name });
          } else {
            done = true;
            defer.resolve({db_id: null});
          }
        });
        runLater(function() {
          if(!done) { console.error("failed to retrieve db id"); defer.resolve({db_id: null}); }
        }, 1000);

        return defer.promise;
      } else {
        return RSVP.resolve({db_id: null});
      }
    }
  },
  get_db_key: function(persist) {
    var key = stashes.get_raw('cd_db_key');
    if(persist) {
      key = key || ("db2_" + Math.random().toString() + "_" + (new Date()).getTime().toString());
      stashes.persist_raw('cd_db_key', key);
    }
    return key
  },
  db_settings: function(cap) {
    var db_key = stashes.get_db_key();
    return stashes.get_db_id(cap).then(function(res) {
      return {
        db_id: res.db_id, 
        db_key: res.db_key || db_key
      }
    });
  },
  get_raw: function(key, include_prefix) {
    if(include_prefix) { key = stashes.prefix + key; }
    var res = null;
    try {
      res = localStorage[key];
    } catch(e) { }
    return res;
  },
  geo: {
    poll: function() {
      if(navigator && navigator.geolocation) { stashes.geolocation = navigator.geolocation; }
      var go = function() {
        if(stashes.geolocation && !LingoLinqAAC.embedded) {
          if(stashes.geo.watching) {
            stashes.geolocation.clearWatch(stashes.geo.watching);
          }
          stashes.geolocation.getCurrentPosition(function(position) {
            stashes.set('geo.latest', position);
          });
          stashes.geo.watching = stashes.geolocation.watchPosition(function(position) {
            stashes.set('geo.latest', position);
          }, function(error) {
            stashes.set('geo.latest', null);
          });
        }
      };
      if(stash_capabilities) {
        stash_capabilities.permissions.assert('geolocation').then(function() { go(); });
      } else {
        go();
      }
    }
  },
  remember: function(opts) {
    opts = opts || {};
    if(!stashes.get('history_enabled')) { return; }
    // TODO: this should be persisted server-side
    var list = stashes.get('remembered_vocalizations');
    var voc = opts.override || stashes.get('working_vocalization') || [];
    if(voc.length === 0) { return; }
    var obj = {
      vocalizations: voc,
      stash: !!opts.stash
    };
    obj.sentence = obj.vocalizations.map(function(v) { return v.label; }).join(" ");
    if(!list.find(function(v) { return v.sentence == obj.sentence; })) {
      list.pushObject(obj);
    }
    stashes.persist('remembered_vocalizations', list);
  },
  current_timestamp: function() {
    return Date.now() / 1000;
  },
  notify_observers(button) {
    if(window.parent && window.parent != window && LingoLinqAAC.embedded) {
      window.parent.postMessage({
        type: 'aac_event',
        aac_type: 'button',
        text: button.vocalization || button.label,
        sentence: stashes.get('working_vocalization').map(function(b) { return b.vocalization || b.label; }).join(" ")
      }, '*');
    }
  },
  track_daily_event: function(type, n) {
    if(n == null) { n = 1; }
    if(daily_event_types.includes(type)) {
      var events = stashes.get('daily_events') || {};
      var today = window.moment().toISOString().substring(0, 10);
      events[today] = events[today] || {};
      if((type == 'models' || type == 'remote_models') && typeof(n) == 'string') {
        events[today]['modeled'] = (events[today]['modeled'] || []).concat(n.split(/\s+/));
        n = 1;
      }
      events[today][type] = (events[today][type] || 0) + n;
      stashes.persist('daily_events', events);
    }
  },
  log_event: function(obj, user_id, session_user_id) {
    var timestamp = stashes.current_timestamp();
    var geo = null;
    if(stashes.geo && stashes.get('geo.latest') && stashes.get('geo_logging_enabled')) { // TODO: timeout if it's been too long?
      geo = [stashes.get('geo.latest').coords.latitude, stashes.get('geo.latest').coords.longitude, stashes.get('geo.latest').coords.altitude];
    }
    var log_event = null;
    var usage_log = stashes.get('usage_log');
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
        stashes.notify_observers(obj);
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
      if(stashes.orientation) {
        log_event.orientation = stashes.orientation;
      }
      if(stashes.volume !== null && stashes.volume !== undefined) {
        log_event.volume = stashes.volume;
      }
      if(stashes.ambient_light !== null && stashes.ambient_light !== undefined) {
        log_event.ambient_light = stashes.ambient_light;
      }
      if(stashes.screen_brightness) {
        log_event.screen_brightness = stashes.screen_brightness;
      }
      if(stashes.get('modeling') || (log_event.button && log_event.button.modeling)) {
        log_event.modeling = true;
      } else if(stashes.last_selection && stashes.last_selection.modeling && stashes.last_selection.ts > ((new Date()).getTime() - 500)) {
        log_event.modeling = true;
      }
      if(log_event.modeling && session_user_id && session_user_id != user_id) {
        log_event.session_user_id = session_user_id;
      }
      log_event.window_width = window.outerWidth;
      log_event.window_height= window.outerHeight;

      if(log_event) {
        stashes.last_id = stashes.last_id || 1;
        if(stashes.last_id > 50000) { stashes.last_id = 1; }
        stashes.id_seed = stashes.id_seed || Math.floor(Math.random() * 10);
        // setting ids client-side may help me troubleshoot how
        // they potentially get out of order in the logs
        log_event.id = (stashes.last_id++ * 10) + stashes.id_seed;
        stashes.persist('last_event', log_event);
        usage_log.push(log_event);
      }
    }
    // Truncate the log to prevent localStorage quota errors
    if (usage_log.length > 250) {
      usage_log = usage_log.slice(usage_log.length - 250);
    }
    stashes.persist('usage_log', usage_log);
    stashes.push_log(true);
    return log_event;
  },
  track_daily_use: function() {
    var now = (new Date()).getTime();
    var today = window.moment().toISOString().substring(0, 10);
    var daily_use = stashes.get('daily_use') || [];
    var found = false;
    var daily_events = stashes.get('daily_events') || {}
    daily_use.forEach(function(d) {
      if(daily_events[d.date]) {
        daily_event_types.forEach(function(t) {
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
    stashes.persist('daily_use', daily_use);
    // once we have data for more than one day, or at least 10 new minutes of usage, push it and then clear the history
    var do_push = daily_use.length > 1 || (found && (found.total_minutes - found.recorded_minutes) > 10);
    if(daily_use.length > 1 && stashes.get('online')) {
      if(found) {
        found.recorded_minutes = found.total_minutes;
      }
      var days = [];
      daily_use.forEach(function(d) {
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
        daily_event_types.forEach(function(t) {
          if(d[t] != null) {
            rec[t] = d[t];
          }
        });
        days.push(rec);
      });
      // ajax call to push daily_use data
      var log = LingoLinqAAC.store.createRecord('log', {
        type: 'daily_use',
        events: days
      });
      log.save().then(function() {
        // clear the old days that have been persisted
        var dailies = stashes.get('daily_use') || [];
        dailies = dailies.filter(function(d) { return d == today; });
        stashes.persist('daily_use', dailies);
      }, function() { });
    }
  },
  log: function(obj) {
    stashes.track_daily_use();
    if(obj && obj.button_id) {
      var modeling = false;
      if(stashes.get('modeling') || (obj && obj.modeling)) {
        modeling = true;
      } else if(stashes.last_selection && stashes.last_selection.modeling && stashes.last_selection.ts > ((new Date()).getTime() - 500)) {
        modeling = true;
      }
      var phrase = null;
      if((obj.add_vocalization || obj.add_vocalization == null) && window.app_state && window.app_state.get('currentUser.supporter_role') && (stashes.get('logging_enabled') || window.app_state.get('currentUser.supervised_units.length'))) {
        // unit supervisors and those with logging enabled 
        // with have their models explicitly tracked for reporting
        phrase = obj.vocalization || obj.label;
      }
      stashes.track_daily_event('models', phrase);
    }
    if(!stashes.get('history_enabled')) { return null; }
    if(!stashes.get('logging_enabled')) { return null; }
    if(window.app_state && window.app_state.get('eval_mode')) { return null; }
    if(stashes.get('logging_paused_at')) {
      var last_event = stashes.get('last_event');
      var pause = stashes.get('logging_paused_at');
      var sixty_minutes_ago = (new Date()).getTime() - (60 * 60 * 1000);
      var six_hours_ago = (new Date()).getTime() - (6 * 60 * 60 * 1000);
      if(last_event && last_event.timestamp > pause && last_event < sixty_minutes_ago) {
//         modal.warning(i18n.t('logging_resumed_inactivity', "Logging has resumed automatically after at least an hour of inactivity"));
        if(stashes.controller) {
          stashes.controller.set('logging_paused_at', null);
        }
        stashes.persist('logging_paused_at', null);
      } else if(last_event && last_event.timestamp > pause && last_event < six_hours_ago) {
//         modal.warning(i18n.t('logging_resumed_pause_expired', "Logging has resumed automatically after being paused for over six hours"));
        if(stashes.controller) {
          stashes.controller.set('logging_paused_at', null);
        }
        stashes.persist('logging_paused_at', null);
      } else {
        stashes.persist('last_event', {timestamp: (new Date()).getTime()});
        return null;
      }
    }
    var user_id = stashes.get('speaking_user_id');
    if(stashes.get('referenced_speak_mode_user_id')) {
      user_id = stashes.get('referenced_speak_mode_user_id');
    }
    return stashes.log_event(obj, user_id, stashes.get('session_user_id'));
  },
  push_log: function(only_if_convenient) {
    var usage_log = stashes.get('usage_log');
    var timestamp = stashes.current_timestamp();
    // Wait at least 10 seconds between log pushes
    if(stashes.last_log_push && timestamp - stashes.last_log_push < 10) {
      if(!stashes.wait_timer) {
        stashes.wait_timer = runLater(function() {
          stashes.wait_timer = null;
          stashes.push_log();
        }, 8000);  
      }
      return;
    }
    // Remove from local store and persist occasionally
    var diff = (usage_log && usage_log[0] && usage_log[0].timestamp) ? (timestamp - usage_log[0].timestamp) : -1;
    // If log pushes have been failing, don't keep trying on every button press
    var wait_on_error = stashes.errored_at && stashes.errored_at > 10 && ((timestamp - stashes.errored_at) < (2 * 60));
    // TODO: add listener on persistence.online and trigger this log save stuff when reconnected
    if(LingoLinqAAC.session && LingoLinqAAC.session.get('isAuthenticated') && stashes.get('online') && usage_log.length > 0 && !wait_on_error) {
      // If there's more than 50 events, or it's been more than 30 minutes
      // since the last recorded event.
      if(usage_log.length > 50 || diff == -1 || diff > (30 * 60 * 1000) || !only_if_convenient) {
        var history = [].concat(usage_log);
        // If there are tons of events, break them up into smaller chunks, this may
        // be why user logs stopped getting persisted for one user's device.
        var to_persist = history.slice(0, 250);
        var for_later = history.slice(250,  history.length);
        stashes.persist('usage_log', [].concat(for_later));
        var log = LingoLinqAAC.store.createRecord('log', {
          events: to_persist
        });
        log.cleanup();
        stashes.last_log_push = timestamp;
        log.save().then(function() {
          stashes.errored_at = null;
          if(for_later.length > 0) {
            runLater(function() {
              stashes.push_log();
            }, 10000);
          }
          // success!
        }, function(err) {
          // error, try again later
          if(!stashes.errored_at || stashes.errored_at <= 2) {
//             stashes.persist('usage_log', to_persist.concat(stashes.get('usage_log')));
            stashes.errored_at = (stashes.errored_at || 0) + 1;
          } else {
//             stashes.set('big_logs', (stashes.get('big_logs') || []).concat([to_persist]));
            stashes.errored_at = stashes.current_timestamp();
          }
          console.log(err);
          console.error("log push failed");
          stashes.persist('usage_log', to_persist.concat(stashes.get('usage_log')));
        });
      }
    }
    if(!stashes.timer) {
      stashes.timer = runLater(function() {
        stashes.timer = null;
        stashes.push_log(only_if_convenient);
      }, 15 * 60 * 1000);
    }
  }
}).create({logging_enabled: false});
stashes.setup();
stashes.geolocation = navigator.geolocation;

window.stashes = stashes;

export default stashes;
