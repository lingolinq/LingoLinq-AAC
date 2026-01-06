import Ember from 'ember';
import EmberObject from '@ember/object';
import { later as runLater, run } from '@ember/runloop';
import RSVP from 'rsvp';
import $ from 'jquery';
import stashes from './_stashes';
import LingoLinq from '../app';
import capabilities from './capabilities';
import persistence from './persistence';
import lingoLinqExtras from './extras';
import app_state from './app_state';
import i18n from './i18n';
import modal from './modal';

var session = EmberObject.extend({
  setup: function(application) {
    application.register('lingolinq:session', session, { instantiate: false, singleton: true });
    $.each(['model', 'controller', 'view', 'route'], function(i, component) {
      application.inject(component, 'session', 'lingolinq:session');
    });
    LingoLinq.session = session;
  },
  persist: function(data) {
    // Set fallback data immediately so it's available even if persistence hasn't completed
    session.set('auth_settings_fallback_data', data);
    // Set capabilities.access_token immediately so Authorization header is sent right away
    if(data.access_token) {
      capabilities.access_token = data.access_token;
      console.log('[session.persist] Set capabilities.access_token immediately:', data.access_token.substring(0, 20) + '...');
    }
    var res = stashes.persist_object('auth_settings', data, true);
    res.then(function(r) { 
      console.log("stashes.persist", r);
      // Verify token is still set after persistence
      if(data.access_token) {
        capabilities.access_token = data.access_token;
      }
    }, function(e) { 
      console.error("stashes.persist", e);
      // Keep token set even if persistence fails
      if(data.access_token) {
        capabilities.access_token = data.access_token;
      }
    });
    return res;
  },
  clear: function() {
    // only used for testing
    stashes.flush('auth_');
  },
  auth_settings_fallback: function() {
    if(session.get('auth_settings_fallback_data')) {
      console.error('auth settings stash lost mid-session');
      var res = session.get('auth_settings_fallback_data');
      if(res.user_name && res.user_name.match(/wahl/)) {
        session.alert('Session information lost unexpectedly');
      }
      return res;
    }
    return null;
  },
  confirm_authentication: function(response) {
    var promises = [];
    promises.push(session.persist({
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
      promises.push(persistence.store('settings', {id: response.user_id}, 'selfUserId').then(null, function() {
        return RSVP.reject({error: "selfUserId not persisted from login"});
      }));
    }
    stashes.persist('prior_login', 'true');
    stashes.persist_object('just_logged_in', true, false);
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
        persistence.ajax('/token', {method: 'POST', data: data}).then(function(response) {
          console.log('[session.authenticate] Authentication succeeded', {
            has_auth_redirect: !!response.auth_redirect,
            has_access_token: !!response.access_token,
            has_user_name: !!response.user_name
          });
          if(response && response.auth_redirect) {
            return resolve({redirect: response.auth_redirect});
          } else {
            session.confirm_authentication(response).then(function() {
              // Ensure capabilities.access_token is set after persistence completes
              var auth_settings = stashes.get_object('auth_settings', true) || {};
              if(auth_settings.access_token) {
                capabilities.access_token = auth_settings.access_token;
                console.log('[session.authenticate] Set capabilities.access_token after confirm_authentication');
              }
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
        session.hashed_password(credentials.password).then(function(pw) {
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
    // Try to get token from storage, with fallback to in-memory data
    var store_data = stashes.get_object('auth_settings', true);
    if(!store_data || !store_data.access_token) {
      // If not in storage, check fallback (in-memory data that's being persisted)
      var fallback = session.auth_settings_fallback();
      if(fallback && fallback.access_token) {
        store_data = fallback;
        console.log('[check_token] Using fallback token data');
      } else {
        store_data = store_data || {};
      }
    }
    var key = store_data.access_token || "none";
    persistence.tokens = persistence.tokens || {};
    persistence.tokens[key] = true;
    var access_token = store_data.access_token || "none";
    var url = '/api/v1/token_check?access_token=' + access_token + "&rnd=" + Math.round(Math.random() * 999999);
    if(store_data.as_user_id) {
      url = url + "&as_user_id=" + store_data.as_user_id;
    }
    console.log('[check_token] Starting token check', {
      url: url,
      online: persistence.get('online'),
      has_token: !!store_data.access_token,
      token_preview: store_data.access_token ? store_data.access_token.substring(0, 10) + '...' : 'none'
    });
    return persistence.ajax(url, {
      type: 'GET'
    }).then(function(data) {
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
        session.set('invalid_token', true);
        session.set('tokenConfirmed', true); // Mark as confirmed even if invalid
        if(allow_invalidate && store_data.access_token) {
          session.force_logout(i18n.t('session_token_invalid', "This session has expired, please log back in"));
          return {success: true};
        }
      } else {
        session.set('invalid_token', false);
        session.set('tokenConfirmed', true); // Mark token validation as complete
      }
      if(data.user_name) {
        session.set('user_name', data.user_name);
        session.set('user_id', data.user_id);
        session.set('modeling_session', data.modeling_session)
        // Ensure capabilities.access_token is set from stored auth_settings
        var auth_settings = stashes.get_object('auth_settings', true) || {};
        if(auth_settings.access_token) {
          capabilities.access_token = auth_settings.access_token;
        }
        if(window.ga) {
          window.ga('set', 'userId', data.user_id);
          window.ga('send', 'event', 'authentication', 'user-id available');
        }
        if(app_state.get('sessionUser.id') != data.user_id) {
          runLater(function() {
            app_state.refresh_session_user();
          });
        }
      }
      if(data.sale !== undefined) {
        LingoLinq.sale = parseInt(data.sale, 10) || false;
      }
      if(data.ws_url) {
        stashes.persist('ws_url', data.ws_url);
      }
      if(data.global_integrations) {
        stashes.persist('global_integrations', data.global_integrations);
        if(window.user_preferences) {
          window.user_preferences.global_integrations = data.global_integrations;
        }
      }
      if(data.meta && data.meta.fakeXHR && data.meta.fakeXHR.browserToken) {
        persistence.set('browserToken', data.meta.fakeXHR.browserToken);
      }
      return RSVP.resolve({success: true, browserToken: persistence.get('browserToken')});
    }, function(data) {
      console.log('[check_token] Token check failed', {
        error_data: data,
        fakeXHR: data && data.fakeXHR ? {
          status: data.fakeXHR.status,
          statusText: data.fakeXHR.statusText
        } : null,
        result: data && data.result,
        online: persistence.get('online')
      });
      
      if(!persistence.get('online')) {
        console.log('[check_token] Already marked as offline, returning success: false');
        return {success: false};
      }
      if(data && data.fakeXHR && data.fakeXHR.browserToken) {
        persistence.set('browserToken', data.fakeXHR.browserToken);
      }
      if(data && data.result && data.result.error == "not online") {
        console.log('[check_token] Error indicates not online');
        return {success: false};
      }
      if(!data && !persistence.get('online')) {
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
      if(isNetworkError && persistence.get('online')) {
        console.log('[check_token] Network error detected, marking as offline');
        persistence.set('online', false);
      }
      
      persistence.tokens[key] = false;
      var result = {success: false, browserToken: persistence.get('browserToken'), networkError: isNetworkError};
      console.log('[check_token] Returning result:', result);
      return RSVP.resolve(result);
    });
  },
  wait_for_token: function(popout_id) {
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
          persistence.ajax('/wait/token', {method: 'POST', data: data}).then(function(response) {
            if(response.error) {
              setTimeout(check, 500);
            } else {
              session.confirm_authentication(response).then(function() {
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
    if(!stashes.get('enabled')) { return {}; }
    console.debug('LINGOLINQ: restoring session data');
    // Try to get token from storage first, then fallback to in-memory data
    var store_data = stashes.get_object('auth_settings', true);
    if(!store_data || !store_data.access_token) {
      // If not in storage, check fallback (in-memory data that's being persisted)
      var fallback = session.auth_settings_fallback();
      if(fallback && fallback.access_token) {
        store_data = fallback;
        console.log('[session.restore] Using fallback token data');
        // Persist the fallback data if it's not already persisted
        if(fallback.access_token) {
          session.persist(fallback).then(function() {
            console.log('[session.restore] Persisted fallback token data');
          });
        }
      } else {
        store_data = store_data || {};
      }
    }
    var key = store_data.access_token || "none";
    persistence.tokens = persistence.tokens || {};
    if(store_data.access_token && !session.get('isAuthenticated')) {
      session.set('isAuthenticated', true);
      session.set('access_token', store_data.access_token);
      session.set('user_name', store_data.user_name);
      session.set('user_id', store_data.user_id);
      session.set('modeling_session', store_data.modeling_session)
      // Ensure capabilities.access_token is set so Authorization header is sent
      capabilities.access_token = store_data.access_token;
      console.log('[session.restore] Set capabilities.access_token:', store_data.access_token ? store_data.access_token.substring(0, 20) + '...' : 'none');
      if(window.ga && store_data.user_id) {
        window.ga('set', 'userId', store_data.user_id);
        window.ga('send', 'event', 'authentication', 'user-id available');
      }
      session.set('as_user_id', store_data.as_user_id);
    } else if(!store_data.access_token) {
      // This should not run until stashes.db_connect has completed, so stashes has its
      // best chance to be populated.
      var any_proof_of_existing_login = Object.keys(store_data).length > 0;
      any_proof_of_existing_login = any_proof_of_existing_login || stashes.fs_user_name || (window.kvstash && window.kvstash.values && window.kvstash.user_name); 
      var do_it = function() {
        if(any_proof_of_existing_login) {
          session.force_logout(i18n.t('session_lost', "Session data has been lost, please log back in"));
        } else {
          session.invalidate();
        }
      };
      if(any_proof_of_existing_login) {
         do_it();
      } else {
        stashes.get_db_id(capabilities).then(function(obj) {
          any_proof_of_existing_login = any_proof_of_existing_login || obj.db_id; 
          do_it();
        });
      }
    }
    if(force_check_for_token || (persistence.tokens[key] == null && !Ember.testing && persistence.get('online'))) {
      if(store_data.access_token || force_check_for_token) { // || !persistence.get('browserToken')) {
        session.check_token(true);
      } else {
        session.set('tokenConfirmed', false);
      }
    }

    return store_data;
  },
  override: function(options) {
    var data = session.restore();
    data.access_token = options.access_token;
    data.user_name = options.user_name;
    data.user_id = options.user_id;
    stashes.flush().then(function() {
      stashes.setup();
      session.persist(data).then(function() {
        session.reload('/');
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
    var full_invalidate = true;//!!(app_state.get('currentUser') || stashes.get_object('auth_settings', true) || session.auth_settings_fallback());
    if(full_invalidate) {
      if(!modal.route) {
        session.alert(message);
        session.invalidate(true);
      } else {
        modal.open('force-logout', {message: message});
      }
    } else {
      var store_data = stashes.get_object('auth_settings', true) || session.auth_settings_fallback() || {};
      if((app_state.get('currentUser.user_name') || '').match(/wahl/) || (store_data.user_name || '').match(/wahl/)) {
        session.alert(message);
      }
      session.invalidate();
    }
  },
  invalidate: function(force) {
    var full_invalidate = force || !!(app_state.get('currentUser') || stashes.get_object('auth_settings', true) || session.auth_settings_fallback());
    if(full_invalidate) {
      if(window.navigator.splashscreen) {
        window.navigator.splashscreen.show();
      }
    }
    stashes.flush().then(null, function() { return RSVP.resolve(); }).then(function() {
      stashes.setup();
      var later = function(callback, delay) { callback(); };
      if(!Ember.testing) {
        later = runLater;
      }

      // Give the session time to clear completely before reloading, otherwise they might
      // not actually get logged out
      later(function() {
        session.set('isAuthenticated', false);
        session.set('access_token', null);
        session.set(' ', null);
        session.set('user_id', null);
        session.set('as_user_id', null);
        // Clear capabilities.access_token so Authorization header is not sent
        capabilities.access_token = null;
        if(full_invalidate) {
          later(function() {
            session.reload('/');
          });
        }
      });
    });

  }
}).create({ });
window.session = session;

export default session;
