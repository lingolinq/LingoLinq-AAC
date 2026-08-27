import Service from '@ember/service';
import { isTesting } from '@ember/debug';
import { inject as service } from '@ember/service';
import { later as runLater, run } from '@ember/runloop';
import RSVP from 'rsvp';
import $ from 'jquery';
import LingoLinq from '../app';
import capabilities from '../utils/capabilities';
import lingoLinqExtras from '../utils/extras';
import i18n from '../utils/i18n';
import evaluation from '../utils/eval';
import modal from '../utils/modal';

export default Service.extend({
  stashes: service('stashes'),
  persistence: service('persistence'),
  appState: service('app-state'),
  router: service(),

  init() {
    this._super(...arguments);
    LingoLinq.session = this;
    if (typeof window !== 'undefined') {
      if (!window.LingoLinq || !window.LingoLinq.Lessons) {
        window.LingoLinq = LingoLinq;
      }
      window.LingoLinq.session = this;
    }
    // Capture, once per boot, whether we just landed here from an INTENTIONAL
    // logout (the flag is set by invalidate() right before its reload). Stashing
    // it on the instance — rather than re-reading localStorage in restore() —
    // means it survives BOTH restore() calls the application route fires per boot.
    // restore() uses it to skip the "session lost" recovery, which would otherwise
    // fire a SECOND full reload on a clean sign-out. One-shot: cleared immediately.
    try {
      if (typeof window !== 'undefined' && window.localStorage && window.localStorage.getItem('lingolinq_just_logged_out')) {
        window.localStorage.removeItem('lingolinq_just_logged_out');
        this._logout_landing = true;
      }
    } catch (e) { /* localStorage unavailable */ }
  },

  // RUNTIME-ONLY proof that the server accepted our token in THIS page session. Set by
  // check_token(); deliberately NOT persisted and NOT restored, unlike `access_token`,
  // `user_name` and `isAuthenticated`, all of which survive a reload and therefore say
  // nothing about whether the token is still good. The sign-in route reads this to decide
  // whether redirecting away from the form is safe — see routes/login.js#beforeModel.
  token_validated: false,

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
    return RSVP.all_wait(promises).then(function() {
      if(_this.persistence && typeof _this.persistence.schedulePostLoginSyncIfNeeded === 'function') {
        _this.persistence.schedulePostLoginSyncIfNeeded();
      }
    }, function() {
      if(_this.persistence && typeof _this.persistence.schedulePostLoginSyncIfNeeded === 'function') {
        _this.persistence.schedulePostLoginSyncIfNeeded();
      }
      return RSVP.resolve();
    });
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
      // Guards a one-time login retry after refreshing a stale browser token (client_secret).
      var browser_token_retried = false;
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
          // Self-heal a stale browser token (client_secret). The server rotates the browser
          // token and returns a fresh one in the BROWSER_TOKEN header on EVERY response,
          // including this 400. A tab left open past the token window sends a stale
          // client_secret, which the server rejects with "Invalid client_secret for client_id"
          // BEFORE it ever checks the password. Persist the fresh token the server just handed
          // us (captured onto fakeXHR.browserToken by extras.js) and retry the login once, so a
          // stale token no longer wedges login until the user manually clears browser storage.
          var respErrorCode = (errorResponse && errorResponse.error) || '';
          var freshBrowserToken = xhr.browserToken;
          if(!browser_token_retried && freshBrowserToken && typeof respErrorCode === 'string' && respErrorCode.match(/client_secret/i)) {
            browser_token_retried = true;
            try { _this.persistence.setBrowserToken(freshBrowserToken); } catch(e) { /* best-effort */ }
            credentials.client_secret = freshBrowserToken;
            console.log('[session.authenticate] Stale client_secret rejected — refreshed browser token and retrying login once');
            return go(password);
          }
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
    var _vb = (window.LingoLinq || {}).verboseDebug;

    if (_vb) {
      console.log('[check_token] Starting token check', {
        url: url,
        online: onlineStatus,
        has_token: !!store_data.access_token,
        token_preview: store_data.access_token ? store_data.access_token.substring(0, 10) + '...' : 'none'
      });
    }
    
    var _this = this;
    if(!this.persistence) {
      return RSVP.resolve({ success: false });
    }
    return this.persistence.ajax(url, {
      type: 'GET'
    }).then(function(data) {
      /* `!_this` alone never fired — `_this` is the service, always truthy. The case that
         actually happens is the service being DESTROYED while this token-check request is
         still in flight: the response lands, every `_this.set(...)` below runs against a
         torn-down object, and Ember throws
             "calling set on destroyed object: <service:session>.token_validated = false"
         In tests that surfaces as a GLOBAL failure charged to whichever test happened to be
         running when the orphaned request resolved — so the suite failed 6-7 tests whose
         names changed every run (593ms/594ms each, the same orphaned op). Guarding here
         rather than at each `set` covers all six writes in this callback plus the
         force_logout/persistence calls, which a destroyed service must not make either.
         Same idiom as `invalidate()` below (:653). See LEARNINGS, "The `token_validated`
         async leak". */
      if(!_this || _this.isDestroyed || _this.isDestroying) { return RSVP.resolve({ success: false }); }
      var _vb = (window.LingoLinq || {}).verboseDebug;
      if (_vb) {
        console.log('[check_token] Token check succeeded', {
          authenticated: data.authenticated,
          has_user_name: !!data.user_name,
          user_id: data.user_id,
          has_meta_fakeXHR: !!(data.meta && data.meta.fakeXHR),
          has_fakeXHR: !!data.fakeXHR,
          browserToken_in_meta: !!(data.meta && data.meta.fakeXHR && data.meta.fakeXHR.browserToken),
          browserToken_in_fakeXHR: !!(data.fakeXHR && data.fakeXHR.browserToken)
        });
      }
      // TODO: what happens if the session token gets invalidated mid-session (i.e. without reload?)
      // TODO: if expired, then re-submit with the refresh token
      if(data.authenticated === false) {
        // Only set invalid_token when we had a real token that is now rejected.
        // When access_token is undefined/'none', we're simply not logged in, not "expired".
        if(store_data.access_token && store_data.access_token !== 'none') {
          _this.set('invalid_token', true);
          _this.set('token_validated', false);
          if(allow_invalidate) {
            _this.force_logout(i18n.t('session_token_invalid', "This session has expired, please log back in"));
            return {success: true};
          }
        } else {
          _this.set('invalid_token', false);
          _this.set('token_validated', false);
        }
      } else {
        _this.set('invalid_token', false);
        _this.set('token_validated', true);
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
        if ((window.LingoLinq || {}).verboseDebug) { console.warn('[check_token] Error getting browserToken:', e); }
      }
      
      return RSVP.resolve({success: true, browserToken: browserToken});
    }, function(data) {
      /* `!_this` alone never fired — `_this` is the service, always truthy. The case that
         actually happens is the service being DESTROYED while this token-check request is
         still in flight: the response lands, every `_this.set(...)` below runs against a
         torn-down object, and Ember throws
             "calling set on destroyed object: <service:session>.token_validated = false"
         In tests that surfaces as a GLOBAL failure charged to whichever test happened to be
         running when the orphaned request resolved — so the suite failed 6-7 tests whose
         names changed every run (593ms/594ms each, the same orphaned op). Guarding here
         rather than at each `set` covers all six writes in this callback plus the
         force_logout/persistence calls, which a destroyed service must not make either.
         Same idiom as `invalidate()` below (:653). See LEARNINGS, "The `token_validated`
         async leak". */
      if(!_this || _this.isDestroyed || _this.isDestroying) { return RSVP.resolve({ success: false }); }
      var onlineStatus = _this.persistence ? _this.persistence.get('online') : false;
      var _vb = (window.LingoLinq || {}).verboseDebug;
      
      if (_vb) {
        console.log('[check_token] Token check failed', {
        error_data: data,
        fakeXHR: data && data.fakeXHR ? {
          status: data.fakeXHR.status,
          statusText: data.fakeXHR.statusText
        } : null,
        result: data && data.result,
        online: onlineStatus
        });
      }
      
      if(!onlineStatus) {
        if (_vb) { console.log('[check_token] Already marked as offline, returning success: false'); }
        /* `token_validated` must mean "the server said yes, just now" — nothing weaker.
           Leaving a previous true here made it a one-way latch: with a server-revoked
           token and a dropped connection, routes/login.js:29 still bounced the user to
           index, index failed to resolve the user, and they landed back on the landing
           page with no route to the sign-in form. */
        _this.set('token_validated', false);
        return {success: false};
      }
      
      if(data && data.fakeXHR && data.fakeXHR.browserToken) {
        _this.persistence.setBrowserToken(data.fakeXHR.browserToken);
      }
      
      // Check for token-related errors and handle appropriately
      if(data && data.result) {
        var result = data.result;
        if(result.invalid_token || result.error === 'Invalid token' || result.error === 'Expired token') {
          if (_vb) {
            console.warn('[check_token] Token is invalid or expired', {
              invalid_token: result.invalid_token,
              error: result.error
            });
          }
          _this.set('invalid_token', true);
          _this.set('token_validated', false);
          if(allow_invalidate) {
            _this.force_logout(i18n.t('session_token_invalid', "This session has expired, please log back in"));
            return {success: false, needsReauth: true};
          }
        } else if(result.error === 'Token needs refresh') {
          if (_vb) { console.warn('[check_token] Token needs refresh'); }
          _this.set('invalid_token', true);
          _this.set('token_validated', false);
          // Could implement token refresh logic here in the future
        }
      }
      if(data && data.result && data.result.error == "not online") {
        if (_vb) { console.log('[check_token] Error indicates not online'); }
        return {success: false};
      }
      
      if(!data && !onlineStatus) {
        if (_vb) { console.log('[check_token] No data and not online'); }
        return {success: false};
      }
      // Check for network/connection errors
      var isNetworkError = false;
      if(data && data.fakeXHR) {
        // Status 0 typically means network error (CORS, connection refused, etc.)
        if(data.fakeXHR.status === 0 || data.fakeXHR.status === undefined) {
          isNetworkError = true;
          if (_vb) { console.log('[check_token] Detected network error: status is 0 or undefined'); }
        } else {
          if (_vb) { console.log('[check_token] HTTP error status:', data.fakeXHR.status); }
        }
      } else if(!data || (data.status === 0)) {
        // No response or status 0 indicates network error
        isNetworkError = true;
        if (_vb) { console.log('[check_token] Detected network error: no data or status 0'); }
      }
      
      // If it's a network error and we thought we were online, mark as offline
      if(isNetworkError && onlineStatus) {
        if (_vb) { console.log('[check_token] Network error detected, marking as offline'); }
         try {
           _this.persistence.set('online', false);
         } catch(e) {
           if (_vb) { console.warn('[check_token] Error setting online to false:', e); }
         }
      }
      
      if(_this.persistence && _this.persistence.tokens) {
        _this.persistence.tokens[key] = false;
      }
      
      var browserTokenForResult = null;
      try {
        browserTokenForResult = _this.persistence.getBrowserToken();
      } catch(e) {
        if (_vb) { console.warn('[check_token] Error getting browserToken for result:', e); }
      }
      
      var result = {success: false, browserToken: browserTokenForResult, networkError: isNetworkError};
      if (_vb) { console.log('[check_token] Returning result:', result); }
      // Not a validation — see the note on the offline return above.
      _this.set('token_validated', false);
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
    var _vb = (window.LingoLinq || {}).verboseDebug;
    console.debug('LINGOLINQ: restoring session data');
    var store_data = this.stashes.get_object('auth_settings', true) || this.auth_settings_fallback() || {};
    var key = store_data.access_token || "none";
    if (_vb) { console.log('[session.restore] auth from stashes', { has_token: !!store_data.access_token, user_name: store_data.user_name }); }

    // Ensure tokens logic works safely
    if(this.persistence && !this.persistence.tokens) {
        this.persistence.tokens = {};
    }
    
    // Sync capabilities.access_token from restored auth_settings
    if(capabilities && store_data.access_token) {
      if(capabilities.access_token !== store_data.access_token) {
        if (_vb) {
          console.log('[session.restore] Updating capabilities.access_token from restored session', {
            old_token_preview: capabilities.access_token ? capabilities.access_token.substring(0, 10) + '...' : 'none',
            new_token_preview: store_data.access_token.substring(0, 10) + '...'
          });
        }
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
    }
    // Always sync masquerade fields from stash when a token is present.
    // Boot calls restore() more than once (instance-initializer + application
    // route activate + delayed re-restore). The second call used to skip this
    // once isAuthenticated was already true, leaving session.as_user_id null
    // so "Stop Masquerading" never rendered — even though auth_settings still
    // carried as_user_id for API query params.
    if(store_data.access_token) {
      this.set('as_user_id', store_data.as_user_id || null);
      this.set('original_user_name', store_data.original_user_name || null);
    }
    if(!store_data.access_token && !this._logout_landing) {
      // (Skipped on a clean logout landing — see `_logout_landing` set in init().
      //  Re-running this "session lost" recovery there would force_logout/invalidate
      //  again → a SECOND full reload, and show a bogus "session data has been lost"
      //  error after an INTENTIONAL sign-out. A voluntary logout should land on the
      //  login page in one navigation with no message; this branch is only for a
      //  genuine mid-session token loss.)
      // This should not run until stashes.db_connect has completed, so stashes has its
      // best chance to be populated.
      var _this = this;
      var any_proof_of_existing_login = Object.keys(store_data).length > 0;
      any_proof_of_existing_login = any_proof_of_existing_login || this.stashes.fs_user_name || (window.kvstash && window.kvstash.values && window.kvstash.user_name);
      var do_it = function() {
        if (_this.isDestroyed || _this.isDestroying) {
          return;
        }
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
          if (_this.isDestroyed || _this.isDestroying) {
            return;
          }
          any_proof_of_existing_login = any_proof_of_existing_login || obj.db_id;
          do_it();
        });
      }
    }
    
    var onlineForCheck = this.persistence ? this.persistence.get('online') : false;
    var tokens = (this.persistence) ? (this.persistence.tokens || {}) : {};
    
    if(force_check_for_token || (tokens[key] == null && !isTesting() && onlineForCheck)) {
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
      if(isTesting()) {
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
    if (!isTesting() && typeof window !== 'undefined') {
      window.alert(message);
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

  // SPA path eligibility predicate. Extracted as a method (not an inline
  // expression) so plan 07 tests can stub it directly without flipping the
  // global Ember.testing flag. SPEC R2, plan 05.
  _invalidate_spa_eligible: function(full_invalidate) {
    return !!full_invalidate &&
           !!this.appState &&
           !!this.appState.get('feature_flags.auth_spa_transition') &&
           !capabilities.installed_app &&
           !isTesting();
  },

  invalidate: function(force) {
    var _this = this;
    if (this.isDestroyed || this.isDestroying) {
      return;
    }
    // Signing out is not a validation. Without this the flag survived logout and
    // routes/login.js:29 could bounce the next visitor away from the sign-in form.
    this.set('token_validated', false);
    var full_invalidate = force || !!(this.appState.get('currentUser') || this.stashes.get_object('auth_settings', true) || this.auth_settings_fallback());
    if(full_invalidate) {
      // Purge any in-progress eval snapshot (partially-answered clinical data)
      // BEFORE the transition/reload so it doesn't survive logout at rest on a
      // shared device (the rest of IndexedDB survives sign-out by design; this
      // transient assessment is different). Best-effort; issued early so the
      // IndexedDB removes have the best chance to commit ahead of any reload.
      try { evaluation.purge_for_logout(); } catch(e) { /* best-effort */ }
      if(window.navigator.splashscreen) {
        window.navigator.splashscreen.show();
      }
      // Flag the bootstrap skeleton's progress card to show logout-
      // appropriate copy ("Signing you out…" / "See you soon") instead
      // of the default login copy ("Preparing your workspace…"). The
      // flag survives the page reload that `reload('/')` triggers a
      // few lines later, and is cleared by the skeleton's inline JS
      // after the first read so subsequent navigations don't keep
      // showing it.
      try {
        if(typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem('lingolinq_auth_intent', 'logging_out');
          // One-shot signal read by session.init() on the next boot so restore()
          // skips its "session lost" recovery (which would re-invalidate → a SECOND
          // reload). Separate from `lingolinq_auth_intent` because the bootstrap
          // clears that one before restore() runs.
          window.localStorage.setItem('lingolinq_just_logged_out', '1');
        }
      } catch(e) { /* localStorage unavailable; skeleton falls back to default copy */ }
    }
    // SPEC R2, R3, R4, R5, R6, R8. Plan 05.
    // Flag is read once, here, before the async chain — avoids mid-flow flag flips.
    var spaTransitionEnabled = _this._invalidate_spa_eligible(full_invalidate);

    this.stashes.flush().then(null, function() { return RSVP.resolve(); }).then(function() {
      _this.stashes.setup();
      var later = function(callback, delay) { callback(); };
      if(!isTesting()) {
        later = runLater;
      }

      // Give the session time to clear completely before navigating, otherwise the
      // user might not actually get logged out.
      later(function() {
        if (_this.isDestroyed || _this.isDestroying) {
          return;
        }
        // STEP (a): Clear auth tokens FIRST. The index route's afterModel
        // checks session.access_token and replaceWith('user.home', user_name)
        // if it sees one. Clearing here ensures the SPA transitionTo('index')
        // actually lands on the login form rather than redirecting to the
        // dashboard. Same on the OFF/reload path — existing behavior.
        _this.set('isAuthenticated', false);
        _this.set('access_token', null);
        _this.set('user_name', null);
        _this.set('user_id', null);
        _this.set('as_user_id', null);
        if(capabilities) {
          capabilities.access_token = null;
        }

        if(full_invalidate) {
          if(spaTransitionEnabled) {
            // SPA path: transition FIRST, then clean up state in the .then()
            // success handler. This ordering prevents observer cascades on
            // inconsistent state and prevents the dashboard's templates from
            // reading destroyed Ember Data records.
            try {
              if(_this.router && typeof _this.router.transitionTo === 'function') {
                var promise = _this.router.transitionTo('index');
                if(promise && typeof promise.then === 'function') {
                  promise.then(function() {
                    // Transition complete — dashboard route is unmounted.
                    // NOW it is safe to null user records and per-user appState.
                    // SPEC R5 cleanup happens here, not before transition.
                    try {
                      if(_this.appState && typeof _this.appState.clear_user_state === 'function') {
                        _this.appState.clear_user_state();
                      }
                      if(typeof LingoLinq !== 'undefined' && LingoLinq && LingoLinq.store && typeof LingoLinq.store.unloadAll === 'function') {
                        LingoLinq.store.unloadAll();
                      }
                      if(_this.persistence && typeof _this.persistence.clear_user_state === 'function') {
                        _this.persistence.clear_user_state();
                      }
                      // Forward-looking 3rd-party SDK reset block. No-op when
                      // SDKs absent (the codebase has no Sentry today). Add
                      // specific resets here as SDKs are added.
                      if(typeof window !== 'undefined' && window.Sentry && typeof window.Sentry.setUser === 'function') {
                        try { window.Sentry.setUser(null); } catch(e) { /* ignore */ }
                      }
                    } catch(err) {
                      // Cleanup error after successful transition. Log but do
                      // not reload — the user is already on the login form.
                      console.warn('[session.invalidate] post-transition cleanup error', err);
                    }
                  }, function(err) {
                    // Transition rejected — fall back to reload. The reload
                    // accomplishes both navigation AND state cleanup by tearing
                    // down the Ember instance. Do NOT call clear_user_state here.
                    console.warn('[session.invalidate] SPA transition rejected, falling back to reload', err);
                    later(function() { _this.reload('/'); });
                  });
                } else {
                  // No thenable returned — defensive: assume success and clean
                  // up synchronously. Templates may not have unmounted yet, so
                  // this branch is best-effort. Should not happen in practice.
                  try {
                    if(_this.appState && typeof _this.appState.clear_user_state === 'function') {
                      _this.appState.clear_user_state();
                    }
                    if(typeof LingoLinq !== 'undefined' && LingoLinq && LingoLinq.store && typeof LingoLinq.store.unloadAll === 'function') {
                      LingoLinq.store.unloadAll();
                    }
                    if(_this.persistence && typeof _this.persistence.clear_user_state === 'function') {
                      _this.persistence.clear_user_state();
                    }
                  } catch(err) {
                    console.warn('[session.invalidate] post-transition cleanup error (no thenable)', err);
                  }
                }
                // Successful transition fired (thenable or not) — DO NOT fall
                // through to reload.
                return;
              }
              // Router unavailable for some reason — fall through to reload.
              console.warn('[session.invalidate] Router unavailable, falling back to reload');
            } catch(err) {
              console.warn('[session.invalidate] SPA transition threw, falling back to reload', err);
            }
            // Fall-through reload (catch block or router unavailable). Tokens
            // already cleared at top of this `later`; the reload will tear
            // down the Ember instance and discard any remaining state.
          }
          later(function() {
            _this.reload('/');
          });
        }
      });
    });

  }
});
