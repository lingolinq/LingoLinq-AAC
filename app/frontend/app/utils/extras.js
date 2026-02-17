import EmberObject from '@ember/object';
import { set as emberSet, get as emberGet } from '@ember/object';
import { later as runLater } from '@ember/runloop';
import $ from 'jquery';
import RSVP from 'rsvp';
import LingoLinq from '../app';
import stashes from './_stashes';
import session from './session';
import i18n from './i18n';
import capabilities from './capabilities';
import app_state from './app_state';

(function() {
  var console_debug = function(str) {
    if(console.debug) {
      console.debug(str);
    } else {
      console.log(str);
    }
  };

  var ready = function(type) {
    ready.types = ready.types || {};
    ready.types[type] = true;
    if(ready.type_callbacks[type]) {
      ready.type_callbacks[type].forEach(function(cb) {
        cb();
      });
      ready.type_callbacks[type] = null;
    }
    if(ready.types.init && ready.types.extras && ready.types.device && ready.types.lang && !ready.done) {
      ready.done = true;
      ready('all');
      // session.restore() is now handled in instance-initializers/session.js to ensure service is ready
      runLater(function() {
        $('html,body').scrollTop(0);
        console.log("LINGOLINQ: ready to start");
        // Only advance readiness once to prevent "same root element" / "descendant of existing app" errors
        if(!window.LingoLinq || !window.LingoLinq.readinessAdvanced) {
          if(window.LingoLinq && window.LingoLinq.app) {
            window.LingoLinq.app.advanceReadiness();
            window.LingoLinq.readinessAdvanced = true;
          }
        }
        LingoLinq.ready();
      });
    }
  };
  ready.watch = function(type, callback) {
    ready.types = ready.types || {};
    ready.type_callbacks = ready.type_callbacks || {};
    if(ready.types[type]) {
      callback();
    } else {
      ready.type_callbacks[type] = ready.type_callbacks[type] || [];
      ready.type_callbacks[type].push(callback);
    }
  };

  var extras = EmberObject.extend({
    setup: function(application) {
      application.register('lingolinq:extras', extras, { instantiate: false, singleton: true });
    },
    advance: ready,
    enable: function() {
      if(this.get('ready')) { return; }

      console_debug("LINGOLINQ: extras ready");
      if(window.app_version) {
        console_debug("LINGOLINQ: app version " + window.app_version);
      }
      this.set('ready', true);
      if(window.speechSynthesis) {
        console_debug("LINGOLINQ: tts enabled");
      }
      extras.advance('extras');
    },
    storage: {
      find: function(store, key) {
        var defer = RSVP.defer();
        capabilities.invoke({type: 'lingoLinqExtras', method: 'storage_find', options: {store: store, key: key}}).then(function(res) {
          defer.resolve(res);
        }, function(err) {
          defer.reject(err);
        });
        return defer.promise;
      },
      find_all: function(store, ids) {
        var defer = RSVP.defer();
        capabilities.invoke({type: 'lingoLinqExtras', method: 'storage_find_all', options: {store: store, ids: ids}}).then(function(res) {
          defer.resolve(res);
        }, function(err) {
          defer.reject(err);
        });
        return defer.promise;
      },
      find_changed: function() {
        var defer = RSVP.defer();
        capabilities.invoke({type: 'lingoLinqExtras', method: 'storage_find_changed', options: {}}).then(function(res) {
          defer.resolve(res);
        }, function(err) {
          defer.reject(err);
        });
        return defer.promise;
      },
      store: function(store, obj, key) {
        var defer = RSVP.defer();
        capabilities.invoke({type: 'lingoLinqExtras', method: 'storage_store', options: {store: store, record: obj}}).then(function(res) {
          defer.resolve(res);
        }, function(err) {
          defer.reject(err);
        });
        return defer.promise;
      },
      remove: function(store, id) {
        var defer = RSVP.defer();
        capabilities.invoke({type: 'lingoLinqExtras', method: 'storage_remove', options: {store: store, record_id: id}}).then(function(res) {
          defer.resolve(res);
        }, function(err) {
          defer.reject(err);
        });
        return defer.promise;
      }
    },
    track_error: function(message) {
      LingoLinq.track_error(message);
    }
  }).create();
  capabilities.device_id = function() {
    var device_id = extras.get_stashes().get_raw('coughDropDeviceId');
    if(!device_id) {
      // http://cordova.apache.org/docs/en/6.x/reference/cordova-plugin-device/index.html#deviceuuid
      device_id = (window.device && window.device.uuid) || ((new Date()).getTime() + Math.random()).toString();
      var readable = capabilities.readable_device_name;
      device_id = device_id + " " + readable;
    }
    extras.get_stashes().persist_raw('coughDropDeviceId', device_id);
    return device_id;
  };

  $.realAjax = $.ajax;
  function fakeXHR(xhr) {
    var res = {status: 0};
    if(xhr && xhr.status) {
      var res = {
        readyState: xhr.readyState,
        responseJSON: xhr.responseJSON,
        responseText: xhr.responseText,
        status: xhr.status,
        statusText: xhr.statusText,
      };
      if(xhr.getResponseHeader && xhr.getResponseHeader('BROWSER_TOKEN')) {
        res.browserToken = xhr.getResponseHeader('BROWSER_TOKEN');
      }
    }
    res.getAllResponseHeaders = function() { return null; };
    return res;
  }

  $.ajax = function(opts) {
    // TODO: on expired token, try refreshing the token and
    // if that succeeds, re-attempt the process
    var _this = this;
    var args = [];
    var options = arguments[0];
//     var clean_options = {};
    if(typeof(arguments[0]) == 'string') {
      options = arguments[1];
      options.url = options.url || arguments[0];
    }

    var original_options = {}
    for(var key in options) {
      original_options[key] = options[key];
    }
    original_options.attempt = (original_options.attempt || 1);
    if(options.url && options.url.match(/\/api\/v\d+\/boards\/.+%2F.+/)) {
      options.url = options.url.replace(/%2F/, '/');
    }
    if(!options.timeout) {
      if(original_options.attempt <= 1 && options.type == 'GET') {
        options.timeout = 8000;
      } else {
        options.timeout = 20000;
      }
      if(options.type == 'POST' && options.url && options.url.match(/s3\.amazonaws/)) {
        // don't timeout for remote uploads
        options.timeout = null;
      }
    }
//     ['async', 'cache', 'contentType', 'context', 'crossDomain', 'data', 'dataType', 'error', 'global', 'headers', 'ifModified', 'isLocal', 'mimeType', 'processData', 'success', 'timeout', 'type', 'url'].forEach(function(key) {
//       if(options[key]) {
//         clean_options[key] = options[key];
//       }
//     });
//     args.push(clean_options);

    // Had to change this to a single promise because iOS 
    // seems to fail silently on chained promises sometimes
    return new RSVP.Promise(function(ajax_resolve, ajax_reject) {
      var prefix = location.protocol + "//" + location.host;
      if(capabilities.installed_app && capabilities.api_host) {
        prefix = capabilities.api_host;
      }
      if(options.url && options.url.indexOf(prefix) === 0) {
        options.url = options.url.substring(prefix.length);
      }
      if(options.url && options.url.match(/^\//)) {
        if(options.url && options.url.match(/^\/(api\/v\d+\/|token)/) && capabilities.installed_app && capabilities.api_host) {
          options.url = capabilities.api_host + options.url;
        }
        options.headers = options.headers || {};
        options.headers['X-INSTALLED-COUGHDROP'] = (!!capabilities.installed_app).toString();
        
        // Add Authorization header with defensive checks for token validity
        // This ensures tokens are properly sent to the backend for authentication
        if(capabilities && capabilities.access_token && capabilities.access_token !== 'none' && capabilities.access_token !== '') {
          var token_preview = capabilities.access_token.substring(0, 10) + '...';
          options.headers['Authorization'] = "Bearer " + capabilities.access_token;
          options.headers['X-Device-Id'] = capabilities.device_id();
          options.headers['X-LingoLinq-Version'] = window.LingoLinq.VERSION;
          
          // Log token usage for debugging (only in development or when explicitly enabled)
          if(window.LingoLinq && (window.LingoLinq.DEBUG || localStorage.getItem('debug_tokens') === 'true')) {
            console.log('[extras.ajax] Adding Authorization header', {
              url: options.url,
              token_preview: token_preview,
              has_device_id: !!capabilities.device_id()
            });
          }
        } else {
          // Log when token is missing for debugging authentication issues
          if(window.LingoLinq && (window.LingoLinq.DEBUG || localStorage.getItem('debug_tokens') === 'true')) {
            console.warn('[extras.ajax] No valid access_token available for request', {
              url: options.url,
              has_capabilities: !!capabilities,
              access_token_value: capabilities ? (capabilities.access_token || 'undefined') : 'capabilities undefined',
              auth_settings: extras.get_stashes().get_object('auth_settings', true) ? 'exists' : 'missing'
            });
          }
        }
        if(LingoLinq.protected_user || extras.get_stashes().get('protected_user')) {
          options.headers['X-SILENCE-LOGGER'] = 'true';
        }
        options.headers['X-SUPPORTS-REMOTE-BUTTONSET'] = 'true';
        options.headers['X-SUPPORTS-REMOTE-ENCRYPTION'] = 'true';
        if(LingoLinq.session && LingoLinq.session.get('as_user_id')) {
          options.headers['X-As-User-Id'] = LingoLinq.session.get('as_user_id');
        }
        if(window.ApplicationCache) {
          options.headers['X-Has-AppCache'] = "true";
        }
        if(LingoLinq.session && LingoLinq.session.get('logging_codes')) {
          var codes = LingoLinq.session.get('logging_codes') || [];
          var too_old = (new Date()).getTime() - (68 * 60 * 1000);
          codes.forEach(function(code) {
            if(code.code && code.user_id && code.timestamp > too_old) {
              options.headers['X-Logging-Code-For-' + code.user_id] = code.code;
            }
          });
        }
      }

      var success = options.success;
      var error = options.error;
      options.success = null;
      options.error = null;
      var error_prep = function(xhr, message, data) {
        if(xhr.responseJSON && !xhr.responseJSON.errors) {
          var response = xhr.responseJSON;
          response.errors = [JSON.parse(xhr.responseText)];
          response.errors[0].parsed = true;
          xhr.responseText = JSON.stringify(response);
          xhr.responseJSON = response;
        }

      };
      var res = $.realAjax(options).then(function(data, message, xhr) {
        if(typeof(data) == 'string') {
          data = {text: data};
        }
        if(data && data.error && data.status && !data.ok) {
          if(data.invalid_token && !extras.get_app_state().get('speak_mode')) {
            // force a login prompt for invalid tokens
            session.force_logout(i18n.t('session_expired', "This session has expired, please log back in"));
          } else {
            console.log("ember ajax returned error: " + data.status + ": " + data.error + " (" + options.url + ")");
            if(error) {
              error_prep(xhr, message, data);
              error.call(this, xhr, message, data);
              // The bowels of ember aren't expecting $.ajax to return a real
              // promise and so they don't catch the rejection properly, which
              // potentially causes all sorts of unexpected uncaught errors.
              // NOTE: this means that any LingoLinq code should not use the error parameter
              // if it expects to receive a proper promise.
              // TODO: raise an error somehow if the caller provides an error function
              // and expects a proper promise in response.
              return ajax_resolve(null);
              // return RSVP.resolve(null);
            } else {
              // var rej = RSVP.reject({
              //   stack: data.status + ": " + data.error + " (" + options.url + ")",
              //   fakeXHR: fakeXHR(xhr),
              //   message: message,
              //   result: data
              // });
              // rej.then(null, function() { });
              // return rej;
              return ajax_reject({
                stack: data.status + ": " + data.error + " (" + options.url + ")",
                fakeXHR: fakeXHR(xhr),
                message: message,
                result: data
              });

            }
          }
        } else {
          if(typeof(data) == 'string') {
          }
          if(data === '' || data === undefined || data === null) {
            data = {};
          }
          data.meta = (data.meta || {});
          data.meta.fakeXHR = fakeXHR(xhr);
          delete data.meta.fakeXHR['responseJSON'];
          $.ajax.meta_push({url: options.url, method: options.type, meta: data.meta});
          if(success) {
            success.call(this, data, message, xhr);
          }
          ajax_resolve(data);
          // return data;
        }
      }, function(xhr, message, result) {
        if((result == 'timeout' || result == '') && xhr.status === 0 && xhr.readyState === 0) {
          if((original_options.attempt <= 2 && original_options.type == 'GET') || original_options.attempt <= 1) {
            // try failed GET requests twice, POST/PUT requests once
            original_options.attempt = (original_options.attempt || 1) + 1
            // return new RSVP.Promise(function(res, rej) {
              runLater(function() {
                $.ajax(original_options).then(function(r) {
                  ajax_resolve(r);
                  // res(r);
                }, function(e) {
                  ajax_reject(e);
                  // rej(e);
                });
              }, 500);
            // });
            return;
          }
        }
        error_prep(xhr, message, result);
        if(xhr.responseJSON && xhr.responseJSON.error) {
          result = xhr.responseJSON.error;
        }
        console.log("ember ajax error: " + xhr.status + ": " + result + " (" + options.type + " " + options.url + ")");
        if(error) {
          xhr.responseJSON = xhr.responseJSON || {error: 'unknown error ' + result};
          // Ember is expecting an error message, even if the response isn't JSON
          error.call(this, xhr, message, result);
        }
        ajax_reject({
          fakeXHR: fakeXHR(xhr),
          message: message,
          result: result
        });
        // var rej = RSVP.reject({
        //   fakeXHR: fakeXHR(xhr),
        //   message: message,
        //   result: result
        // });
        // rej.then(null, function() { });
        // return rej;
      });
      res.then(null, function() { });
      return res;
    });
  };
  $.ajax.metas = [];
  $.ajax.meta_push = function(opts) {
    var now = (new Date()).getTime();
    opts.ts = now;

    var metas = $.ajax.metas || [];
    var new_list = [];
    var res = null;
    metas.forEach(function(meta) {
      if(!meta.ts || meta.ts < now - 1000) {
        new_list.push(meta);
      }
    });
    new_list.push(opts);
    $.ajax.metas = new_list;
  };
  $.ajax.meta = function(method, store, id) {
    var res = null;
    var metas = $.ajax.metas || [];
    // TODO: pluralize correctly using same ember library
    var url = "/api/v1/" + store + "s";
    if(capabilities.installed_app && capabilities.api_host) {
      url = capabilities.api_host + url;
    }
    if(id) { url = url + "/" + id; }
    metas.forEach(function(meta) {
      if(meta.method == method && (url == meta.url || (store == meta.model && id == meta.id))) {
        res = meta.meta;
      }
    });
    return res;
  };
  extras.meta = $.ajax.meta;
  extras.meta_push = $.ajax.meta_push;

  window.lingoLinqExtras = extras;
  extras.advance.watch('device', function() {
    capabilities.invoke({type: 'lingoLinqExtras', method: 'init'}).then(function(res) {
      extras.enable();
    }, function(err) {
      // TODO: this happens when there is no db, in which case the web site should still
      // work, but we should really keep track of whether extras happened correctly, since
      // it could affect the interface.
      extras.set('offline_available', false);
      extras.enable();
    });
  });

  var status_listener = function(e) {
    var list = [];
    for(var idx in (e.statuses || {})) {
      var name = idx;
      var code = e.statuses[idx].code;
      var dormant = e.statuses[idx].dormant;
      var val = code;
      var active = false;
      var disabled = true;
      if(name == 'eyex') {
        if(code == 2)          { val = "connected";                         disabled = false;
        } else if(code == -1)  { val = "stream init failed";
        } else if(code == 3)   { val = "waiting for data";   active = true; disabled = false;
        } else if(code == 5)   { val = "disconnected";
        } else if(code == 1)   { val = "trying to connect";                 disabled = false;
        } else if(code == -2)  { val = "version too low";
        } else if(code == -3)  { val = "version too high";
        } else if(code == 4)   { val = "data received";      active = true; disabled = false;
        } else if(code == 10)  { val = "initialized";                       disabled = false;
        } else if(code == -10) { val = "init failed";
        } else if(code == -4) { val = "device disconnected";
        } else if(code == -5) { val = "tracking paused";     active = true; disabled = false; dormant = true;
        } else if(code == -6) { val = "user not detected";   active = true; disabled = false; dormant = true;
        }
      } else if(name == 'eyetribe') {
        if(code == 'not_initialized') {
        } else if(code == 'not_tracking') {       active = true; disabled = false;
        } else if(code == 'fully_tracking') {     active = true; disabled = false;
        } else if(code == 'partial_tracking') {   active = true; disabled = false;
        }
      }
      if(e.statuses[idx]) {
        list.push({
          name: name,
          status: val,
          code: code,
          active: active,
          dormant: dormant,
          disabled: disabled
        });
      }
    }
    emberSet(capabilities.eye_gaze, 'statuses', list);
  };
  extras.set('status_listener', status_listener);
  $(document).on('eye-gaze-status', status_listener);
})();

window.time_log = function(str) {
  var stamp = Math.round((((new Date()).getTime() / 1000) % 100) * 100) / 100;
  console.log(str + "  :" + stamp);
};

// Static service registry for app_state and stashes
var extras = window.lingoLinqExtras;
extras._services = {
  appState: null,
  stashes: null
};
extras.register_services = function(appStateService, stashesService) {
  if(appStateService) { extras._services.appState = appStateService; }
  if(stashesService) { extras._services.stashes = stashesService; }
};
extras.get_app_state = function() {
  return extras._services.appState || app_state;
};
extras.get_stashes = function() {
  return extras._services.stashes || stashes;
};

export default window.lingoLinqExtras;
