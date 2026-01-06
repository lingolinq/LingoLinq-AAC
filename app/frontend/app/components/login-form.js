import Ember from 'ember';
import Component from '@ember/component';
import { later as runLater, cancel as cancelLater } from '@ember/runloop';
import $ from 'jquery';
import capabilities from '../utils/capabilities';
import stashes from '../utils/_stashes';
import persistence from '../utils/persistence';
import i18n from '../utils/i18n';
import app_state from '../utils/app_state';
import session from '../utils/session';
import { isEmpty } from '@ember/utils';
import LingoLinq from '../app';
import { htmlSafe } from '@ember/string';
import { observer } from '@ember/object';
import { computed } from '@ember/object';
import RSVP from 'rsvp';

export default Component.extend({
  willInsertElement: function() {
    var _this = this;
    this.set('stashes', stashes);
    this.set('checking_for_secret', false);
    this.set('login_followup', null);
    this.set('login_single_assertion', null);
    this.set('status_2fa', null);
    this.set('prompt_2fa', null);
    this.set('pendingTimeouts', []);
    this.browserTokenChange = function() {
      if (!_this.isDestroyed && !_this.isDestroying) {
        _this.set('client_id', 'browser');
        _this.set('client_secret', persistence.get('browserToken'));
        _this.set('checking_for_secret', false);
      }
    };
    persistence.addObserver('browserToken', this.browserTokenChange);
    this.set('long_token', false);
    var token = persistence.get('browserToken');
    if(this.get('tmp_token')) {
      this.check_tmp_token(this.get('tmp_token'));
    }
    if(token) {
      this.set('client_id', 'browser');
      this.set('client_secret', token);
    } else {
      this.set('checking_for_secret', true);
      var timeout = this.get('restore') === false ? 100 : 2000;
      var timeoutHandle = runLater(function() {
        if (!_this.isDestroyed && !_this.isDestroying) {
          _this.check_for_missing_token();
        }
      }, timeout);
      this.get('pendingTimeouts').push(timeoutHandle);
      if(this.get('restore') !== false) {
        session.restore(true);
      }
    }
    if(this.get('set_overflow')) {
      $("html,body").css('overflow', 'hidden');
    }
  },
  check_for_missing_token: function() {
    var _this = this;
    if (_this.isDestroyed || _this.isDestroying) {
      console.log('[login-form] Component destroyed, skipping check_for_missing_token');
      return;
    }
    console.log('[login-form] check_for_missing_token called', {
      has_client_secret: !!_this.get('client_secret'),
      online: persistence.get('online')
    });
    _this.set('checking_for_secret', false);
    if(!_this.get('client_secret')) {
      console.log('[login-form] No client_secret, starting token check');
      _this.set('requesting', true);
      session.check_token().then(function(result) {
        if (_this.isDestroyed || _this.isDestroying) {
          console.log('[login-form] Component destroyed during token check success');
          return;
        }
        console.log('[login-form] Token check completed', {
          success: result && result.success,
          networkError: result && result.networkError,
          has_browserToken: !!result && !!result.browserToken,
          browserToken_preview: result && result.browserToken ? result.browserToken.substring(0, 20) + '...' : null,
          persistence_browserToken: persistence.get('browserToken') ? persistence.get('browserToken').substring(0, 20) + '...' : null
        });
        // If we got a browserToken, it should already be set in persistence via the observer
        // But let's make sure client_secret is set
        var browserToken = result && result.browserToken || persistence.get('browserToken');
        if (browserToken && !_this.get('client_secret')) {
          console.log('[login-form] Setting client_secret from browserToken');
          _this.set('client_secret', browserToken);
          _this.set('client_id', 'browser');
        }
        _this.set('requesting', false);
        // If there was a network error, wait a bit longer before retrying
        var retryDelay = (result && result.networkError) ? 5000 : 2000;
        console.log('[login-form] Scheduling retry in', retryDelay, 'ms');
        var timeoutHandle = runLater(function() {
          if (!_this.isDestroyed && !_this.isDestroying) {
            _this.check_for_missing_token();
          }
        }, retryDelay);
        _this.get('pendingTimeouts').push(timeoutHandle);
      }, function(error) {
        if (_this.isDestroyed || _this.isDestroying) {
          console.log('[login-form] Component destroyed during token check error');
          return;
        }
        console.log('[login-form] Token check rejected (unexpected)', error);
        _this.set('requesting', false);
        // On rejection, wait longer before retrying (likely network issue)
        console.log('[login-form] Scheduling retry in 5000ms (rejection)');
        var timeoutHandle = runLater(function() {
          if (!_this.isDestroyed && !_this.isDestroying) {
            _this.check_for_missing_token();
          }
        }, 5000);
        _this.get('pendingTimeouts').push(timeoutHandle);
      });
    } else {
      console.log('[login-form] Has client_secret, skipping token check');
    }
  },
  check_tmp_token: function(token, code_2fa) {
    var _this = this;
    var url = '/api/v1/token_check?tmp_token=' + token + "&include_token=1&rnd=" + Math.round(Math.random() * 999999);
    if(code_2fa) {
      url = url + "&2fa_code=" + encodeURIComponent(code_2fa);
    }
    return persistence.ajax(url, {
      type: 'GET'
    }).then(function(data) {
      if(data.authenticated && data.token) {
        return session.confirm_authentication(data.token).then(function() {
          _this.handle_auth(data.token);
        }, function(err) {
          return RSVP.reject(err);
        });
      } else {
        return RSVP.reject({error: 'no token found'});
      }
    });
  },
  redirect_login: function(url) {
    var _this = this;
    _this.set('redirecting', true);
    if(!url.match(/device_id=/)) {
      url = url + "&device_id=" + capabilities.device_id();
    }
    if(capabilities.installed_app) {
      var popout_id = (new Date()).getTime() + "T" + Math.round(Math.random() * 999999);
      url = url + "&popout_id=" + popout_id;
      session.wait_for_token(popout_id).then(function(res) {
        _this.handle_auth(res);
      }, function(err) {
        _this.set('login_followup', false);
        _this.set('login_single_assertion', false);
        app_state.set('logging_in', false);
        _this.set('logging_in', false);
        _this.set('logged_in', false);
        _this.set('login_error', i18n.t('token_not_retrieved', "Authorization never completed, please try again"));
      });
      window.open(url, '_blank');
    } else {
      location.href = url;
    }
    setTimeout(function() {
      _this.set('redirecting', false);
    }, 5000);
  },
  handle_auth: function(data) {
    var _this = this;
    console.log('[login-form] handle_auth called', {
      has_access_token: !!data.access_token,
      missing_2fa: !!data.missing_2fa,
      temporary_device: !!data.temporary_device,
      long_token: !!data.long_token
    });
    // Ensure token is persisted before proceeding
    // If data has access_token, ensure it's persisted via confirm_authentication
    var ensure_token_persisted = function() {
      if(data.access_token) {
        // Set capabilities.access_token immediately so it's available for API requests
        capabilities.access_token = data.access_token;
        session.set('access_token', data.access_token);
        session.set('isAuthenticated', true);
        console.log('[login-form] Set capabilities.access_token immediately:', data.access_token.substring(0, 20) + '...');
        
        // Ensure token is persisted - confirm_authentication may have already been called,
        // but we ensure it completes before proceeding
        return session.confirm_authentication(data).then(function() {
          // Verify token is still set after persistence
          var verify = stashes.get_object('auth_settings', true) || session.auth_settings_fallback() || {};
          if(verify.access_token) {
            capabilities.access_token = verify.access_token;
            console.log('[login-form] Token confirmed and persisted, capabilities.access_token verified');
          } else {
            console.warn('[login-form] Token not found after persistence, using original');
            capabilities.access_token = data.access_token;
          }
          return RSVP.resolve();
        }, function(err) {
          console.error('[login-form] Failed to persist token:', err);
          // Keep the token set even if persistence fails
          capabilities.access_token = data.access_token;
          return RSVP.resolve(); // Continue anyway
        });
      } else {
        return RSVP.resolve();
      }
    };
    
    if(data.missing_2fa) {
      _this.set('prompt_2fa', {needed: true, token: data.access_token});
      if(data.set_2fa) {
        _this.set('prompt_2fa.uri', data.set_2fa);
        // 2fa secret is new, so show the QR code
        // in addition to the 2fa code prompt
      }
      _this.set('status_2fa', null);
      _this.set('code_2fa', null);
      // TODO: admin UI for resetting 2fa
    } else if(data.temporary_device) {
      // Eval accounts can only have one session at a time
      ensure_token_persisted().then(function() {
        _this.send('login_success', false);
      });
      _this.set('login_single_assertion', true);
      _this.set('login_followup', false);
    } else if(!data.long_token) {
      // follow-up question, is this a shared device?
      ensure_token_persisted().then(function() {
        _this.send('login_success', false);
      });
      _this.set('login_followup', true);
      _this.set('login_single_assertion', false)
      _this.set('login_followup_already_long_token', data.long_token_set);
    } else {
      ensure_token_persisted().then(function() {
        _this.send('login_success', true);
      });
    }
  },
  first_login: computed(function() {
    return !stashes.get('prior_login');
  }),
  box_class: computed('left', 'wide', function() {
    if(this.get('wide')) {
      return htmlSafe('col-md-8 col-md-offset-2 col-sm-offset-1 col-sm-10');
    } else if(this.get('left')) {
      return htmlSafe('col-md-4 col-sm-6');
    } else {
      return htmlSafe('col-md-offset-4 col-md-4 col-sm-offset-3 col-sm-6');
    }
  }),
  app_state: computed(function() {
    return app_state;
  }),
  persistence: computed(function() {
    return persistence;
  }),
  willDestroyElement: function() {
    persistence.removeObserver('browserToken', this.browserTokenChange);
    // Cancel all pending timeouts to prevent setting properties on destroyed component
    var timeouts = this.get('pendingTimeouts') || [];
    timeouts.forEach(function(timeoutHandle) {
      if (timeoutHandle) {
        cancelLater(timeoutHandle);
      }
    });
    this.set('pendingTimeouts', []);
  },
  browserless: computed(function() {
    return capabilities.browserless;
  }),
  noSubmit: computed('logging_in', 'logged_in', 'noSecret', 'redirecting', function() {
    return this.get('noSecret') || this.get('redirecting') || this.get('logging_in') || this.get('logged_in') || this.get('login_followup');
  }),
  noSecret: computed('client_secret', function() {
    return !this.get('client_secret');
  }),
  actions: {
    login_success: function(reload) {
      var _this = this;
      console.log('[login-form] login_success called', {reload: reload});
      
      // Read auth_settings BEFORE flushing to ensure we have the token
      var auth_settings = stashes.get_object('auth_settings', true) || {};
      console.log('[login-form] Before flush, auth_settings:', {
        has_access_token: !!auth_settings.access_token,
        user_name: auth_settings.user_name,
        user_id: auth_settings.user_id
      });
      
      // Store the token temporarily so we don't lose it during flush
      var saved_token = auth_settings.access_token;
      var saved_user_name = auth_settings.user_name;
      var saved_user_id = auth_settings.user_id;
      
      if(reload) {
        if(window.navigator.splashscreen) {
          window.navigator.splashscreen.show();
        }
      }
      
      // Only flush if we're reloading - otherwise the token should already be persisted
      var wait;
      if(reload) {
        // Flush old auth data, but preserve auth_settings by re-storing it after
        wait = stashes.flush(null, 'auth_').then(function() {
          stashes.setup();
          // Re-store the auth_settings after flush to ensure it persists
          if(saved_token) {
            console.log('[login-form] Re-storing auth_settings after flush');
            return session.persist({
              access_token: saved_token,
              user_name: saved_user_name,
              user_id: saved_user_id,
              token_type: 'bearer'
            }).then(function() {
              // Verify it was stored
              var verify = stashes.get_object('auth_settings', true) || {};
              console.log('[login-form] After re-store, auth_settings:', {
                has_access_token: !!verify.access_token,
                matches: verify.access_token === saved_token
              });
              capabilities.access_token = verify.access_token || saved_token;
              session.set('access_token', verify.access_token || saved_token);
              session.set('isAuthenticated', true);
            });
          } else {
            // Try to read it again in case it survived the flush
            var verify = stashes.get_object('auth_settings', true) || {};
            capabilities.access_token = verify.access_token;
            if(verify.access_token) {
              session.set('access_token', verify.access_token);
              session.set('isAuthenticated', true);
            }
            return RSVP.resolve();
          }
        });
      } else {
        // Not reloading, just ensure token is set
        wait = RSVP.resolve();
        // Verify token is still there
        var verify = stashes.get_object('auth_settings', true) || {};
        if(verify.access_token) {
          capabilities.access_token = verify.access_token;
          session.set('access_token', verify.access_token);
          session.set('isAuthenticated', true);
        } else if(saved_token) {
          // Token was lost, re-store it
          console.warn('[login-form] Token lost, re-storing');
          session.persist({
            access_token: saved_token,
            user_name: saved_user_name,
            user_id: saved_user_id,
            token_type: 'bearer'
          }).then(function() {
            capabilities.access_token = saved_token;
            session.set('access_token', saved_token);
            session.set('isAuthenticated', true);
          });
        }
      }
      
      // Set capabilities immediately with saved token
      capabilities.access_token = saved_token || capabilities.access_token;
      if(saved_token) {
        session.set('access_token', saved_token);
        session.set('isAuthenticated', true);
      }
      
      _this.set('logging_in', false);
      _this.set('login_followup', false);
      _this.set('login_single_assertion', false);
      _this.set('logged_in', true);
      if(reload) {
        runLater(function() {
          app_state.set('logging_in', true);
        }, 1000);
        if(Ember.testing) {
          console.error("would have redirected to home");
        } else {
          wait.then(function() {
            if(_this.get('return')) {
              location.reload();
              session.set('return', true);
            } else if(capabilities.installed_app) {
              location.href = '#/';
              location.reload();
            } else {
              location.href = '/';
            }
          });
        }
      }
    },
    login_force_logut: function(choice) {
      if(choice) {
        this.send('login_followup', true);
      } else {
        session.invalidate(true);        
      }
    },
    login_followup: function(choice) {
      var _this = this;
      LingoLinq.store.findRecord('user', 'self').then(function(u) {
        u.set('preferences.device.long_token', !!choice);
        u.set('preferences.device.asserted', true);
        u.save().then(function() {
          _this.send('login_success', true);
        }, function(err) {
          _this.set('login_followup', false);
          _this.set('login_single_assertion', false);
          app_state.set('logging_in', false);
          _this.set('logging_in', false);
          _this.set('logged_in', false);
          _this.set('login_error', i18n.t('user_update_failed', "Updating login preferences failed"));
        });
      }, function(err) {
        _this.set('login_followup', false);
        _this.set('login_single_assertion', false);
        app_state.set('logging_in', false);
        _this.set('logging_in', false);
        _this.set('logged_in', false);
        _this.set('login_error', i18n.t('user_retrieve_failed', "Retrieving login preferences failed"));
      });
    },
    logout: function() {
      session.invalidate(true);
    },
    confirm_2fa: function() {
      var _this = this;
      var token = _this.get('prompt_2fa.token') || 'none';
      var url = '/api/v1/token_check?access_token=' + token + "&include_token=1&rnd=" + Math.round(Math.random() * 999999);
      url = url + "&2fa_code=" + encodeURIComponent(_this.get('code_2fa') || '');
      _this.set('status_2fa', {loading: true});
      persistence.ajax(url, {
        type: 'GET'
      }).then(function(data) {
        if(data.authenticated && data.token && data.valid_2fa) {
          session.confirm_authentication(data.token).then(function() {
            _this.set('status_2fa', {confirmed: true});
            _this.handle_auth(data.token);
          }, function(err) {
            _this.set('status_2fa', {error: true});
          });
        } else {
          _this.set('status_2fa', {error: true});
        }
      }, function(err) {
        _this.set('status_2fa', {error: true});
      });
    },
    authenticate: function() {
      this.set('logging_in', true);
      app_state.set('logging_in', true);
      this.set('login_error', null);
      var _this = this;
      var data = this.getProperties('identification', 'password', 'client_secret', 'long_token', 'browserless');
      console.log('[login-form] authenticate called', {
        has_identification: !!data.identification,
        has_password: !!data.password,
        has_client_secret: !!data.client_secret,
        client_secret_preview: data.client_secret ? data.client_secret.substring(0, 20) + '...' : 'none',
        long_token: data.long_token,
        browserless: data.browserless
      });
      if(capabilities.browserless || capabilities.installed_app) {
        data.long_token = true;
        data.browserless = true;
      }
      if (!isEmpty(data.identification) && !isEmpty(data.password)) {
        this.set('password', null);
        _this.set('login_followup_already_long_token', false);
        session.authenticate(data).then(function(data) {
          console.log('[login-form] Authentication succeeded', {
            has_redirect: !!data.redirect,
            has_token: !!data.access_token
          });
          if(data.redirect) {
            _this.redirect_login(data.redirect);
          } else {
            _this.handle_auth(data);
          }
        }, function(err) {
          console.log('[login-form] Authentication error', {
            error: err,
            error_type: err && err.constructor && err.constructor.name,
            error_message: err && err.message,
            error_error: err && err.error,
            error_status: err && err.status
          });
          err = err || {};
          _this.set('logging_in', false);
          app_state.set('logging_in', false);
          if(err.error == "Invalid authentication attempt") {
            _this.set('login_error', i18n.t('invalid_login', "Invalid user name or password"));
          } else if(err.error == "Invalid client secret") {
            _this.set('login_error', i18n.t('expired_login', "Your login token is expired, please try again"));
          } else if(err.error && err.error.match(/user name was changed/i) && err.user_name) {
            _this.set('login_error', i18n.t('user_name_changed', "NOTE: User name has changed to \"%{un}\"", {un: err.user_name}));
          } else {
            console.log('[login-form] Unexpected error, showing generic message', err);
            _this.set('login_error', i18n.t('login_error', "There was an unexpected problem logging in"));
          }
        });
      } else {
        var err = function() {
          _this.set('login_error', i18n.t('login_required', "Username and password are both required"));
          _this.set('logging_in', false);  
        };
        if(!isEmpty(data.identification)) {
          persistence.ajax('/auth/lookup', {type: 'POST', data: {ref: data.identification}}).then(function(res) {
            if(res && res.url) {
              _this.redirect_login(res.url);
            } else {
              err();
            }
          }, function(error) {
            err();
          });
        } else {
          err();
        }
      }
    }
  }
});
