import Component from '@ember/component';
import { isTesting } from '@ember/debug';
import { later as runLater, cancel as cancelLater } from '@ember/runloop';
import $ from 'jquery';
import capabilities from '../utils/capabilities';
import i18n from '../utils/i18n';
import { isEmpty } from '@ember/utils';
import LingoLinq from '../app';
import { htmlSafe } from '@ember/template';
import { observer } from '@ember/object';
import { computed } from '@ember/object';
import RSVP from 'rsvp';
import { inject as service } from '@ember/service';
import { alias } from '@ember/object/computed';

// Debug: logs that persist across full page reload (stored in sessionStorage)
var _loginDebugLog = [];
function _loginDebug(msg, data) {
  var entry = { t: Date.now(), msg: msg, data: data || {} };
  _loginDebugLog.push(entry);
  try { sessionStorage.setItem('lingolinq_login_debug', JSON.stringify(_loginDebugLog.slice(-50))); } catch (e) {}
  console.log('[LOGIN-DEBUG]', msg, data);
}

export default Component.extend({
  appState: service('app-state'),
  persistence: service('persistence'),
  stashes: service('stashes'),
  router: service('router'),
  session: service('session'),
  app_state: alias('appState'),
  willInsertElement: function() {
    var _this = this;
    this.set('stashes', this.stashes);
    this.set('checking_for_secret', false);
    this.set('login_followup', null);
    this.set('login_single_assertion', null);
    this.set('status_2fa', null);
    this.set('prompt_2fa', null);
    this.set('pendingTimeouts', []);
    this.browserTokenChange = function() {
      if (!_this.isDestroyed && !_this.isDestroying) {
        _this.set('client_id', 'browser');
        _this.set('client_secret', _this.persistence.getBrowserToken());
        _this.set('checking_for_secret', false);
      }
    };
    this.persistence.addObserver('browserToken', this.browserTokenChange);
    this.set('long_token', false);
    var token = this.persistence.getBrowserToken();
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
        this.session.restore(true);
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
      online: _this.persistence.get('online')
    });
    _this.set('checking_for_secret', false);
    if(!_this.get('client_secret')) {
      console.log('[login-form] No client_secret, starting token check');
      _this.set('requesting', true);
      _this.session.check_token().then(function(result) {
        if (_this.isDestroyed || _this.isDestroying) {
          console.log('[login-form] Component destroyed during token check success');
          return;
        }
        console.log('[login-form] Token check completed', {
          success: result && result.success,
          networkError: result && result.networkError,
          has_browserToken: !!result && !!result.browserToken,
          browserToken_preview: result && result.browserToken ? result.browserToken.substring(0, 20) + '...' : null,
          persistence_browserToken: _this.persistence.getBrowserToken() ? _this.persistence.getBrowserToken().substring(0, 20) + '...' : null
        });
        // If we got a browserToken, it should already be set in persistence via the observer
        // But let's make sure client_secret is set
        var browserToken = result && result.browserToken || _this.persistence.getBrowserToken();
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
    return this.persistence.ajax(url, {
      type: 'GET'
    }).then(function(data) {
      if(data.authenticated && data.token) {
        return _this.session.confirm_authentication(data.token).then(function() {
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
      _this.session.wait_for_token(popout_id).then(function(res) {
        _this.handle_auth(res);
      }, function(err) {
        _this.set('login_followup', false);
        _this.set('login_single_assertion', false);
        _this.appState.set('logging_in', false);
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
    // Ensure access_token is immediately available in capabilities for subsequent API requests
    if(data && data.access_token && capabilities) {
      if(capabilities.access_token !== data.access_token) {
        console.log('[login-form.handle_auth] Setting capabilities.access_token from auth data', {
          token_preview: data.access_token.substring(0, 10) + '...'
        });
        capabilities.access_token = data.access_token;
        if(capabilities.sync_access_token) {
          capabilities.sync_access_token();
        }
      }
    }
    
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
      _this.session.confirm_authentication(data).then(function() {
        _this.set('login_single_assertion', true);
        _this.set('login_followup', false);
        _this.send('login_success', false);
      }, function(err) {
        if (!_this.isDestroyed && !_this.isDestroying) {
          _this.set('logging_in', false);
          _this.appState.set('logging_in', false);
          _this.set('login_error', i18n.t('login_error', "There was an unexpected problem logging in"));
        }
      });
    } else if(!data.long_token) {
      // follow-up question, is this a shared device?
      _this.session.confirm_authentication(data).then(function() {
        _this.set('login_followup', true);
        _this.set('login_single_assertion', false);
        _this.set('login_followup_already_long_token', data.long_token_set);
        _this.send('login_success', false);
      }, function(err) {
        if (!_this.isDestroyed && !_this.isDestroying) {
          _this.set('logging_in', false);
          _this.appState.set('logging_in', false);
          _this.set('login_error', i18n.t('login_error', "There was an unexpected problem logging in"));
        }
      });
    } else {
      _this.session.confirm_authentication(data).then(function() {
        _this.send('login_success', true);
      }, function(err) {
        if (!_this.isDestroyed && !_this.isDestroying) {
          _this.set('logging_in', false);
          _this.appState.set('logging_in', false);
          _this.set('login_error', i18n.t('login_error', "There was an unexpected problem logging in"));
        }
      });
    }
  },
  first_login: computed(function() {
    return !this.stashes.get('prior_login');
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
  willDestroyElement: function() {
    this.persistence.removeObserver('browserToken', this.browserTokenChange);
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
      _loginDebug('login_success called', { reload: reload });

      var auth_settings = _this.stashes.get_object('auth_settings', true) || {};
      _loginDebug('Before flush', { has_token: !!auth_settings.access_token, user_name: auth_settings.user_name });
      
      // Store the token temporarily so we don't lose it during flush
      var saved_token = auth_settings.access_token;
      var saved_user_name = auth_settings.user_name;
      var saved_user_id = auth_settings.user_id;
      
      if(reload) {
        if(window.navigator.splashscreen) {
          window.navigator.splashscreen.show();
        }
      }
      // wait = stashes flush -> setup -> refresh_session_user (ensures navbar shows signed-in state before transition)
      var wait = this.stashes.flush(null, 'auth_').then(function() {
        _this.stashes.setup();
      }).then(function() {
        var auth_settings = _this.stashes.get_object('auth_settings', true) || {};
        // Use saved_token as fallback if flush/setup cleared auth_settings from memory briefly
        var token = auth_settings.access_token || saved_token;
        capabilities.access_token = token;
        if(token && capabilities.sync_access_token) {
          capabilities.sync_access_token();
        }
        _loginDebug('After flush', { has_token: !!token, ls_has_auth: !!localStorage['cdStash-auth_settings'] });
        _this.set('logging_in', false);
        _this.set('login_followup', false);
        _this.set('login_single_assertion', false);
        _this.set('logged_in', true);
        // Sync session state from stashes so isAuthenticated/access_token are set
        _this.session.restore();
        // Fetch user and set sessionUser/currentUser so navbar shows signed-in state
        return _this.appState.refresh_session_user();
      });
      if(reload) {
        runLater(function() {
          _this.appState.set('logging_in', true);
        }, 1000);
        if(isTesting()) {
          console.error("would have redirected to home");
        } else if(capabilities.installed_app) {
          wait.then(function() {
            if(_this.get('return')) {
              location.reload();
              _this.session.set('return', true);
            } else {
              location.href = '#/';
              location.reload();
            }
          });
        } else {
          // Web: wait for stashes flush AND user fetch before transitioning
          // so navbar shows signed-in state (sessionUser/currentUser) without page refresh
          var transitionDone = false;
          var transitionToDashboard = function() {
            if(transitionDone || _this.isDestroyed || _this.isDestroying) { return; }
            transitionDone = true;
            if(_this.get('return')) {
              location.reload();
              _this.session.set('return', true);
            } else {
              _loginDebug('Web: transitioning to index (no reload)');
              _this.router.transitionTo('index');
            }
          };
          wait.then(transitionToDashboard, function(err) {
            if(_this.isDestroyed || _this.isDestroying) { return; }
            console.warn('[login_success] User fetch failed, transitioning anyway', err);
            transitionToDashboard();
          });
          // Fallback: if promises hang (e.g. slow API, IndexedDB), transition after 5s
          runLater(function() {
            if(!transitionDone && _this.get('logged_in')) {
              console.warn('[login_success] Fallback: transitioning after timeout');
              transitionToDashboard();
            }
          }, 5000);
        }
      }
    },
    login_force_logut: function(choice) {
      var _this = this;
      if(choice) {
        _this.send('login_followup', true);
      } else {
        _this.session.invalidate(true);
      }
    },
    login_followup: function(choice) {
      var _this = this;
      // Check if component is already destroyed
      if (_this.isDestroyed || _this.isDestroying) {
        return;
      }
      
      // Helper function to set error state consistently
      var setErrorState = function(errorMessage) {
        if (_this.isDestroyed || _this.isDestroying) {
          return;
        }
        _this.set('login_followup', false);
        _this.set('login_single_assertion', false);
        _this.appState.set('logging_in', false);
        _this.set('logging_in', false);
        _this.set('logged_in', false);
        if (errorMessage) {
          _this.set('login_error', errorMessage);
        }
      };
      
      // Ensure capabilities.access_token is set before making the user request
      // This prevents 401 errors when fetching user preferences
      var ensureToken = function() {
        // Check if component is destroyed
        if (_this.isDestroyed || _this.isDestroying) {
          return RSVP.reject(new Error('Component destroyed'));
        }
        
        // Check if token is already available
        var hasToken = capabilities && capabilities.access_token && capabilities.access_token !== 'none' && capabilities.access_token !== '';
        if(!hasToken) {
          // Check auth_settings as fallback
          var auth_settings = _this.stashes.get_object('auth_settings', true) || {};
          if(auth_settings.access_token && auth_settings.access_token !== 'none' && auth_settings.access_token !== '') {
            // Token exists in auth_settings, sync it to capabilities
            if(capabilities) {
              capabilities.access_token = auth_settings.access_token;
              if(capabilities.sync_access_token) {
                capabilities.sync_access_token();
              }
            }
            hasToken = true;
          }
        }
        if(hasToken) {
          return RSVP.resolve();
        }
        // Wait a bit for token to sync, then check again
        var timeoutHandle = null;
        return new RSVP.Promise(function(resolve, reject) {
          var attempts = 0;
          var maxAttempts = 10;
          var checkToken = function() {
            // Check if component is destroyed
            if (_this.isDestroyed || _this.isDestroying) {
              reject(new Error('Component destroyed'));
              return;
            }
            
            attempts++;
            var tokenAvailable = capabilities && capabilities.access_token && capabilities.access_token !== 'none' && capabilities.access_token !== '';
            if(!tokenAvailable) {
              // Check auth_settings again
              var auth_settings = _this.stashes.get_object('auth_settings', true) || {};
              if(auth_settings.access_token && auth_settings.access_token !== 'none' && auth_settings.access_token !== '') {
                if(capabilities) {
                  capabilities.access_token = auth_settings.access_token;
                  if(capabilities.sync_access_token) {
                    capabilities.sync_access_token();
                  }
                }
                tokenAvailable = true;
              }
            }
            if(tokenAvailable) {
              resolve();
            } else if(attempts < maxAttempts) {
              timeoutHandle = runLater(checkToken, 100);
              _this.get('pendingTimeouts').push(timeoutHandle);
            } else {
              // Token not available after max attempts - reject instead of proceeding
              reject(new Error('Token not available after maximum attempts'));
            }
          };
          timeoutHandle = runLater(checkToken, 50);
          _this.get('pendingTimeouts').push(timeoutHandle);
        });
      };
      
      ensureToken().then(function() {
        // Check if component is destroyed
        if (_this.isDestroyed || _this.isDestroying) {
          return;
        }
        
        // Sync token once - no need for multiple delayed calls
        if(capabilities && capabilities.sync_access_token) {
          capabilities.sync_access_token();
        }
        
        // Double-check token is available before making request
        var token = capabilities && capabilities.access_token;
        if(!token || token === 'none' || token === '') {
          var auth_settings = _this.stashes.get_object('auth_settings', true) || {};
          token = auth_settings.access_token;
          if(token && token !== 'none' && token !== '') {
            if(capabilities) {
              capabilities.access_token = token;
              if(capabilities.sync_access_token) {
                capabilities.sync_access_token();
              }
            }
          }
        }
        
        if(!token || token === 'none' || token === '') {
          console.warn('[login-form.login_followup] No access token available, cannot fetch user preferences', {
            has_capabilities: !!capabilities,
            capabilities_token: capabilities ? (capabilities.access_token || 'undefined') : 'capabilities undefined',
            auth_settings: _this.stashes.get_object('auth_settings', true) ? 'exists' : 'missing'
          });
          setErrorState(i18n.t('user_retrieve_failed', "Retrieving login preferences failed - authentication token not available"));
          return;
        }
        
        console.log('[login-form.login_followup] Token available, fetching user preferences', {
          token_preview: token.substring(0, 10) + '...',
          has_capabilities: !!capabilities,
          capabilities_token_set: !!(capabilities && capabilities.access_token)
        });
        
        LingoLinq.store.findRecord('user', 'self').then(function(u) {
          // Check if component is destroyed
          if (_this.isDestroyed || _this.isDestroying) {
            return;
          }
          u.set('preferences.device.long_token', !!choice);
          u.set('preferences.device.asserted', true);
          u.save().then(function() {
            if (_this.isDestroyed || _this.isDestroying) {
              return;
            }
            _this.send('login_success', true);
          }, function(err) {
            setErrorState(i18n.t('user_update_failed', "Updating login preferences failed"));
          });
        }, function(err) {
          setErrorState(i18n.t('user_retrieve_failed', "Retrieving login preferences failed"));
        });
      }, function(error) {
        // Handle token fetch failure
        if (_this.isDestroyed || _this.isDestroying) {
          return;
        }
        console.warn('[login-form.login_followup] Token ensure failed', error);
        setErrorState(i18n.t('user_retrieve_failed', "Retrieving login preferences failed - authentication token not available"));
      });
    },
    logout: function() {
      this.session.invalidate(true);
    },
    confirm_2fa: function() {
      var _this = this;
      var token = _this.get('prompt_2fa.token') || 'none';
      var url = '/api/v1/token_check?access_token=' + token + "&include_token=1&rnd=" + Math.round(Math.random() * 999999);
      url = url + "&2fa_code=" + encodeURIComponent(_this.get('code_2fa') || '');
      _this.set('status_2fa', {loading: true});
      _this.persistence.ajax(url, {
        type: 'GET'
      }).then(function(data) {
        if(data.authenticated && data.token && data.valid_2fa) {
          _this.session.confirm_authentication(data.token).then(function() {
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
      this.appState.set('logging_in', true);
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
        _this.session.authenticate(data).then(function(data) {
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
          _this.appState.set('logging_in', false);
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
          _this.persistence.ajax('/auth/lookup', {type: 'POST', data: {ref: data.identification}}).then(function(res) {
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
