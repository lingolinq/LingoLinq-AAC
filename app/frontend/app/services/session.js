import Service from '@ember/service';
import Ember from 'ember';
import { inject as service } from '@ember/service';
import { later as runLater, run } from '@ember/runloop';
import RSVP from 'rsvp';
import $ from 'jquery';
import LingoLinq from '../app';
import capabilities from '../utils/capabilities';
import lingoLinqExtras from '../utils/extras';
import i18n from '../utils/i18n';
import modal from '../utils/modal';

export default Service.extend({
  stashes: service('stashes'),
  persistence: service('persistence'),
  appState: service('app-state'),

  init() {
    this._super(...arguments);
    LingoLinq.session = this;
    if (typeof window !== 'undefined') {
      window.LingoLinq = window.LingoLinq || {};
      window.LingoLinq.session = this;
    }
  },

  persist: function(data) {
    this.set('auth_settings_fallback_data', data);
    var res = this.stashes.persist_object('auth_settings', data, true);
    res.then(function(r) { console.log("stashes.persist", r) }, function(e) { console.error("stashes.persist", e); });
    return res;
  },

  clear: function() {
    // only used for testing
    this.stashes.flush('auth_');
  },

  auth_settings_fallback: function() {
    if(this.get('auth_settings_fallback_data')) {
      console.error('auth settings stash lost mid-session');
      var res = this.get('auth_settings_fallback_data');
      if(res.user_name && res.user_name.match(/wahl/)) {
        this.alert('Session information lost unexpectedly');
      }
      return res;
    }
    return null;
  },

  confirm_authentication: function(response) {
    var _this = this;
    // Immediately update capabilities.access_token so API requests work right away
    // This is critical for ensuring tokens are sent in subsequent requests
    if(capabilities && response.access_token) {
      if(capabilities.access_token !== response.access_token) {
        console.log('[session.confirm_authentication] Updating capabilities.access_token from authentication response', {
          old_token_preview: capabilities.access_token ? capabilities.access_token.substring(0, 10) + '...' : 'none',
          new_token_preview: response.access_token.substring(0, 10) + '...'
        });
        capabilities.access_token = response.access_token;
      }
      // Also call sync function if it exists (from capabilities.init)
      if(capabilities.sync_access_token) {
        capabilities.sync_access_token();
      }
    }
    
    var promises = [];
    promises.push(this.persist({
      access_token: response.access_token,
      token_type: response.token_type,
      user_name: response.user_name,
      modeling_session: response.modeling_session,
      user_id: response.user_id
    }));
    // update selfUserId, in the off chance that it has changed from our local copy
    // due to my user_name being renamed, and then me logging in to a new account
    // with the old user_name.
    if(response.user_id) {
      promises.push(this.persistence.store('settings', {id: response.user_id}, 'selfUserId').then(null, function() {
        return RSVP.reject({error: "selfUserId not persisted from login"});
      }));
    }
    this.stashes.persist('prior_login', 'true');
    this.stashes.persist_object('just_logged_in', true, false);
    return RSVP.all_wait(promises).then(null, function() { return RSVP.resolve(); });
  },

  hashed_password: function(password) {
    if(!window.crypto || !window.crypto.subtle || !window.crypto.subtle.digest) { return RSVP.resolve(password); }
    return new RSVP.Promise(function(resolve, reject) {
      var str = "cdpassword:" + password + ":digested"
      window.crypto.subtle.digest('SHA-512', new TextEncoder().encode(str)).then(function(buffer) { 
        var hashArray = Array.from(new Uint8Array(buffer));
        var hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        var hashed_password = ['hashed', 'sha512', hex].join("?:#")
        resolve(hashed_password);
      }, function(err) {
        resolve(password);
      });
    });
  },

  authenticate: function(credentials) {
    var _this = this;
    var res = new RSVP.Promise(function(resolve, reject) {
      var go = function(password) {
        var data = {
          grant_type: 'password',
          client_id: 'browser',
          client_secret: credentials.client_secret,
          username: credentials.identification,
          password: password,
          device_id: capabilities.device_id(),
          system_version: capabilities.system_version,
          system: capabilities.system,
          long_token: credentials.long_token,
          mobile: (!!capabilities.mobile).toString()
        };
  
        console.log('[session.authenticate] Sending authentication request', {
          username: data.username,
          client_id: data.client_id,
          has_client_secret: !!data.client_secret,
          client_secret_preview: data.client_secret ? data.client_secret.substring(0, 10) + '...' : 'none'
        });
        _this.persistence.ajax('/token', {method: 'POST', data: data}).then(function(response) {
          console.log('[session.authenticate] Authentication succeeded', {
            has_auth_redirect: !!response.auth_redirect,
            has_access_token: !!response.access_token,
            has_user_name: !!response.user_name
          });
          if(response && response.auth_redirect) {
            return resolve({redirect: response.auth_redirect});
          } else {
            _this.confirm_authentication(response).then(function() {
              resolve(response);
            });  
          }
        }, function(data) {
          console.log('[session.authenticate] Authentication failed', {
            error_data: data,
            error: data && data.error,
            fakeXHR: data && data.fakeXHR ? {
              status: data.fakeXHR.status,
              statusText: data.fakeXHR.statusText,
              responseJSON: data.fakeXHR.responseJSON,
              responseText: data.fakeXHR.responseText
            } : null
          });
          var xhr = data.fakeXHR || {};
          var errorResponse = xhr.responseJSON || data.error || xhr.responseText || data;
          console.log('[session.authenticate] Rejecting with error', errorResponse);
          run(function() {
            reject(errorResponse);
          });
        });  
      };
      if(credentials.identification && credentials.identification.match(/^model@/) &&  credentials.password && credentials.password.match(/\?:\#/)) {
        // Modeling hashed passwords are already hashed, and
        // pre-hashing them messes up our confirmation
        go(credentials.password);
      } else {
        _this.hashed_password(credentials.password).then(function(pw) {
          go(pw);
        }, function(err) {
          go(credentials.password);
        });  
      }
    });
    res.then(null, function() { });
    return res;
  },

  check_token: function(allow_invalidate) {
    if(!this) { return RSVP.resolve({ success: false }); }
    var store_data = this.stashes.get_object('auth_settings', true) || this.auth_settings_fallback() || {};
    var key = store_data.access_token || "none";
    
    // Safely update tokens on persistence service
    if(this.persistence && this.persistence.tokens) {
      this.persistence.tokens[key] = true;
    } else {
      // Fallback if tokens object doesn't exist yet (though service assumes it might)
      if(this.persistence) {
        this.persistence.tokens = {};
        this.persistence.tokens[key] = true;
      }
    }

    var access_token = store_data.access_token || "none";
    var url = '/api/v1/token_check?access_token=' + access_token + "&rnd=" + Math.round(Math.random() * 999999);
    if(store_data.as_user_id) {
      url = url + "&as_user_id=" + store_data.as_user_id;
    }
    
    var onlineStatus = this.persistence ? this.persistence.get('online') : false;

    console.log('[check_token] Starting token check', {
      url: url,
      online: onlineStatus,
      has_token: !!store_data.access_token,
      token_preview: store_data.access_token ? store_data.access_token.substring(0, 10) + '...' : 'none'
    });
    
    var _this = this;
    if(!this.persistence) {
      return RSVP.resolve({ success: false });
    }
    return this.persistence.ajax(url, {
      type: 'GET'
    }).then(function(data) {
      if(!_this) { return RSVP.resolve({ success: false }); }
      console.log('[check_token] Token check succeeded', {
        authenticated: data.authenticated,
        has_user_name: !!data.user_name,
        user_id: data.user_id,
        has_meta_fakeXHR: !!(data.meta && data.meta.fakeXHR),
        has_fakeXHR: !!data.fakeXHR,
        browserToken_in_meta: !!(data.meta && data.meta.fakeXHR && data.meta.fakeXHR.browserToken),
        browserToken_in_fakeXHR: !!(data.fakeXHR && data.fakeXHR.browserToken)
      });
      // TODO: what happens if the session token gets invalidated mid-session (i.e. without reload?)
      // TODO: if expired, then re-submit with the refresh token
      if(data.authenticated === false) {
        // Only set invalid_token when we had a real token that is now rejected.
        // When access_token is undefined/'none', we're simply not logged in, not "expired".
        if(store_data.access_token && store_data.access_token !== 'none') {
          _this.set('invalid_token', true);
          if(allow_invalidate) {
            _this.force_logout(i18n.t('session_token_invalid', "This session has expired, please log back in"));
            return {success: true};
          }
        } else {
          _this.set('invalid_token', false);
        }
      } else {
        _this.set('invalid_token', false);
      }
      if(data.user_name) {
        _this.set('user_name', data.user_name);
        _this.set('user_id', data.user_id);
        _this.set('modeling_session', data.modeling_session)
        if(window.ga) {
          window.ga('set', 'userId', data.user_id);
          window.ga('send', 'event', 'authentication', 'user-id available');
        }
        if(_this.appState.get('sessionUser.id') != data.user_id) {
          runLater(function() {
            _this.appState.refresh_session_user();
          });
        }
      }
      if(data.sale !== undefined) {
        LingoLinq.sale = parseInt(data.sale, 10) || false;
      }
      if(data.ws_url) {
        _this.stashes.persist('ws_url', data.ws_url);
      }
      if(data.global_integrations) {
        _this.stashes.persist('global_integrations', data.global_integrations);
        if(window.user_preferences) {
          window.user_preferences.global_integrations = data.global_integrations;
        }
      }
      
      if(data.meta && data.meta.fakeXHR && data.meta.fakeXHR.browserToken) {
        _this.persistence.setBrowserToken(data.meta.fakeXHR.browserToken);
      }
      
      var browserToken = null;
      try {
        browserToken = _this.persistence.getBrowserToken();
      } catch(e) {
        console.warn('[check_token] Error getting browserToken:', e);
      }
      
      return RSVP.resolve({success: true, browserToken: browserToken});
    }, function(data) {
      if(!_this) { return RSVP.resolve({ success: false }); }
      var onlineStatus = _this.persistence ? _this.persistence.get('online') : false;
      
      console.log('[check_token] Token check failed', {
        error_data: data,
        fakeXHR: data && data.fakeXHR ? {
          status: data.fakeXHR.status,
          statusText: data.fakeXHR.statusText
        } : null,
        result: data && data.result,
        online: onlineStatus
      });
      
      if(!onlineStatus) {
        console.log('[check_token] Already marked as offline, returning success: false');
        return {success: false};
      }
      
      if(data && data.fakeXHR && data.fakeXHR.browserToken) {
        _this.persistence.setBrowserToken(data.fakeXHR.browserToken);
      }
      
      // Check for token-related errors and handle appropriately
      if(data && data.result) {
        var result = data.result;
        if(result.invalid_token || result.error === 'Invalid token' || result.error === 'Expired token') {
          console.warn('[check_token] Token is invalid or expired', {
            invalid_token: result.invalid_token,
            error: result.error
          });
          _this.set('invalid_token', true);
          if(allow_invalidate) {
            _this.force_logout(i18n.t('session_token_invalid', "This session has expired, please log back in"));
            return {success: false, needsReauth: true};
          }
        } else if(result.error === 'Token needs refresh') {
          console.warn('[check_token] Token needs refresh');
          _this.set('invalid_token', true);
          // Could implement token refresh logic here in the future
        }
      }
      if(data && data.result && data.result.error == "not online") {
        console.log('[check_token] Error indicates not online');
        return {success: false};
      }
      
      if(!data && !onlineStatus) {
        console.log('[check_token] No data and not online');
        return {success: false};
      }
      // Check for network/connection errors
      var isNetworkError = false;
      if(data && data.fakeXHR) {
        // Status 0 typically means network error (CORS, connection refused, etc.)
        if(data.fakeXHR.status === 0 || data.fakeXHR.status === undefined) {
          isNetworkError = true;
          console.log('[check_token] Detected network error: status is 0 or undefined');
        } else {
          console.log('[check_token] HTTP error status:', data.fakeXHR.status);
        }
      } else if(!data || (data.status === 0)) {
        // No response or status 0 indicates network error
        isNetworkError = true;
        console.log('[check_token] Detected network error: no data or status 0');
      }
      
      // If it's a network error and we thought we were online, mark as offline
      if(isNetworkError && onlineStatus) {
        console.log('[check_token] Network error detected, marking as offline');
         try {
           _this.persistence.set('online', false);
         } catch(e) {
           console.warn('[check_token] Error setting online to false:', e);
         }
      }
      
      if(_this.persistence && _this.persistence.tokens) {
        _this.persistence.tokens[key] = false;
      }
      
      var browserTokenForResult = null;
      try {
        browserTokenForResult = _this.persistence.getBrowserToken();
      } catch(e) {
        console.warn('[check_token] Error getting browserToken for result:', e);
      }
      
      var result = {success: false, browserToken: browserTokenForResult, networkError: isNetworkError};
      console.log('[check_token] Returning result:', result);
      return RSVP.resolve(result);
    });
  },

  wait_for_token: function(popout_id) {
    var _this = this;
    return new RSVP.Promise(function(resolve, reject) {
      var started = (new Date()).getTime();
      var errors = 0;
      var check = function() {
        var now = (new Date()).getTime();
        if(now - started > (15 * 60 * 1000)) {
          reject({error: 'timeout'});
        } else if(errors > 10) {
          reject({error: 'too many errors'});
        } else {
          var data = {
            popout_id: popout_id
          }
          _this.persistence.ajax('/wait/token', {method: 'POST', data: data}).then(function(response) {
            if(response.error) {
              setTimeout(check, 500);
            } else {
              _this.confirm_authentication(response).then(function() {
                resolve(response);
              });    
            }
          }, function(err) {
            errors++;
            setTimeout(check, 2000);
          });  
        }
      }
      setTimeout(check, 1000);
    });
  },

  restore: function(force_check_for_token) {
    if(!this.stashes.get('enabled')) { return {}; }
    try {
      var prior = sessionStorage.getItem('lingolinq_login_debug');
      if(prior) {
        var arr = JSON.parse(prior);
        console.log('[LOGIN-DEBUG] Prior page log:', arr);
      }
    } catch (e) {}
    console.debug('LINGOLINQ: restoring session data');
    var store_data = this.stashes.get_object('auth_settings', true) || this.auth_settings_fallback() || {};
    var key = store_data.access_token || "none";
    console.log('[session.restore] auth from stashes', { has_token: !!store_data.access_token, user_name: store_data.user_name });

    // Ensure tokens logic works safely
    if(this.persistence && !this.persistence.tokens) {
        this.persistence.tokens = {};
    }
    
    // Sync capabilities.access_token from restored auth_settings
    if(capabilities && store_data.access_token) {
      if(capabilities.access_token !== store_data.access_token) {
        console.log('[session.restore] Updating capabilities.access_token from restored session', {
          old_token_preview: capabilities.access_token ? capabilities.access_token.substring(0, 10) + '...' : 'none',
          new_token_preview: store_data.access_token.substring(0, 10) + '...'
        });
        capabilities.access_token = store_data.access_token;
      }
      // Also call sync function if it exists (from capabilities.init)
      if(capabilities.sync_access_token) {
        capabilities.sync_access_token();
      }
    }
    
    if(store_data.access_token && !this.get('isAuthenticated')) {
      this.set('isAuthenticated', true);
      this.set('access_token', store_data.access_token);
      this.set('user_name', store_data.user_name);
      this.set('user_id', store_data.user_id);
      this.set('modeling_session', store_data.modeling_session)
      if(window.ga && store_data.user_id) {
        window.ga('set', 'userId', store_data.user_id);
        window.ga('send', 'event', 'authentication', 'user-id available');
      }
      this.set('as_user_id', store_data.as_user_id);
    } else if(!store_data.access_token) {
      // This should not run until stashes.db_connect has completed, so stashes has its
      // best chance to be populated.
      var _this = this;
      var any_proof_of_existing_login = Object.keys(store_data).length > 0;
      any_proof_of_existing_login = any_proof_of_existing_login || this.stashes.fs_user_name || (window.kvstash && window.kvstash.values && window.kvstash.user_name); 
      var do_it = function() {
        if(any_proof_of_existing_login) {
          _this.force_logout(i18n.t('session_lost', "Session data has been lost, please log back in"));
        } else {
          _this.invalidate();
        }
      };
      if(any_proof_of_existing_login) {
         do_it();
      } else {
        this.stashes.get_db_id(capabilities).then(function(obj) {
          any_proof_of_existing_login = any_proof_of_existing_login || obj.db_id; 
          do_it();
        });
      }
    }
    
    var onlineForCheck = this.persistence ? this.persistence.get('online') : false;
    var tokens = (this.persistence) ? (this.persistence.tokens || {}) : {};
    
    if(force_check_for_token || (tokens[key] == null && !Ember.testing && onlineForCheck)) {
      if(store_data.access_token || force_check_for_token) { 
        this.check_token(true);
      } else {
        this.set('tokenConfirmed', false);
      }
    }

    return store_data;
  },

  override: function(options) {
    var _this = this;
    var data = this.restore();
    data.access_token = options.access_token;
    data.user_name = options.user_name;
    data.user_id = options.user_id;
    this.stashes.flush().then(function() {
      _this.stashes.setup();
      _this.persist(data).then(function() {
        _this.reload('/');
      });  
    });
  },

  reload: function(path) {
    if(path) {
      if(Ember.testing) {
        console.error("would have redirected off the page");
      } else {
        if(capabilities.installed_app) {
          location.href = '#' + path;
          location.reload();
          if(window.navigator.splashscreen) {
            window.navigator.splashscreen.show();
          }
        } else {
          location.href = path;
        }
      }
    } else {
      location.reload();
    }
  },

  alert: function(message) {
    if(!Ember.testing) {
      alert(message);
    }
  },

  force_logout: function(message) {
    var full_invalidate = true;
    if(full_invalidate) {
      if(!modal.route) {
        this.alert(message);
        this.invalidate(true);
      } else {
        modal.open('force-logout', {message: message});
      }
    } else {
      var store_data = this.stashes.get_object('auth_settings', true) || this.auth_settings_fallback() || {};
      if((this.appState.get('currentUser.user_name') || '').match(/wahl/) || (store_data.user_name || '').match(/wahl/)) {
        this.alert(message);
      }
      this.invalidate();
    }
  },

  invalidate: function(force) {
    var _this = this;
    var full_invalidate = force || !!(this.appState.get('currentUser') || this.stashes.get_object('auth_settings', true) || this.auth_settings_fallback());
    if(full_invalidate) {
      if(window.navigator.splashscreen) {
        window.navigator.splashscreen.show();
      }
    }
    this.stashes.flush().then(null, function() { return RSVP.resolve(); }).then(function() {
      _this.stashes.setup();
      var later = function(callback, delay) { callback(); };
      if(!Ember.testing) {
        later = runLater;
      }

      // Give the session time to clear completely before reloading, otherwise they might
      // not actually get logged out
      later(function() {
        _this.set('isAuthenticated', false);
        _this.set('access_token', null);
        _this.set('user_name', null);
        _this.set('user_id', null);
        _this.set('as_user_id', null);
        if(capabilities) {
          capabilities.access_token = null;
        }
        if(full_invalidate) {
          later(function() {
            _this.reload('/');
          });
        }
      });
    });

  }
});
