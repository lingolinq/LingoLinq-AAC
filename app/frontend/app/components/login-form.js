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

export default Component.extend({
  appState: service('app-state'),
  persistence: service('persistence'),
  stashes: service('stashes'),
  router: service('router'),
  session: service('session'),
  app_state: alias('appState'),
  clearGoogleLinkSession: function() {
    this.set('google_link_nonce', null);
    try { sessionStorage.removeItem('google_link_nonce'); } catch (e) { /* ignore */ }
  },
  expireGoogleLinkSession: function() {
    this.clearGoogleLinkSession();
    this.set('google_link_state', null);
    this.set('google_link_password', null);
    this.set('google_link_selected_user_name', null);
    this.set('google_link_error', null);
    this.set('google_link_linking_another', false);
    this.set('login_error', i18n.t('google_link_session_expired', "This Google sign-in session expired. Please try again."));
  },
  syncGoogleReturnParams: function() {
    if(typeof window === 'undefined') { return; }
    var params = new URLSearchParams(window.location.search || '');
    var googleLink = params.get('google_link');
    var googleError = params.get('google_error');
    var googlePopout = params.get('google_popout');
    var coppaRevoked = params.get('coppa_revoked');
    var coppaDeclined = params.get('coppa_declined');
    if(!googleLink) {
      try { googleLink = sessionStorage.getItem('google_link_nonce'); } catch (e) { /* ignore */ }
    }
    if(googleLink && !this.get('google_link_nonce')) {
      this.set('google_link_nonce', googleLink);
    }
    if(googleError && !this.get('google_error')) {
      this.set('google_error', googleError);
      this.set('login_error', this.googleAuthErrorMessage(googleError));
    }
    if(googlePopout && !this.get('google_popout_id')) {
      this.set('google_popout_id', googlePopout);
    }
    if(coppaRevoked && !this.get('login_error')) {
      this.set('coppa_awaiting_parent', false);
      this.set('coppa_needs_parent_email', true);
      this.set('login_error', i18n.t('coppa_login_blocked_parent_consent_revoked', "A parent or guardian withdrew consent for this account. It cannot be used until consent is given again."));
    }
    // Google SSO finish redirects here with ?coppa_declined=1 (session_controller#google_finish_login).
    // Mirror the password-login API error path so parents who declined see the blocked message
    // without needing a subsequent token grant failure.
    if(coppaDeclined && !this.get('login_error')) {
      this.set('coppa_awaiting_parent', false);
      this.set('coppa_needs_parent_email', false);
      this.set('login_error', i18n.t('coppa_login_blocked_parent_consent_declined', "A parent or guardian declined consent for this account. It is scheduled for deletion and cannot be used."));
    }
    var coppaParentEmail = params.get('coppa_parent_email');
    if(coppaParentEmail && !this.get('login_error')) {
      this.set('coppa_awaiting_parent', false);
      this.set('coppa_needs_parent_email', true);
      this.set('login_error', i18n.t('coppa_login_needs_parent_email', "A parent or guardian email is required before this account can be used. Enter it below so we can send an approval request."));
    }
  },
  googleLinkNonceObserver: observer('google_link_nonce', function() {
    this.ensureGoogleLinkLoaded();
  }),
  didReceiveAttrs: function() {
    this._super(...arguments);
    this.syncGoogleReturnParams();
    this.ensureGoogleLinkLoaded();
  },
  ensureGoogleLinkLoaded: function() {
    if(!this.get('google_link_nonce')) { return; }
    var state = this.get('google_link_state');
    if(state && (state.loading || state.mode || state.error)) { return; }
    this.loadGoogleLinkCandidates();
  },
  willInsertElement: function() {
    var _this = this;
    this.syncGoogleReturnParams();
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
      this.check_tmp_token(this.get('tmp_token')).catch(function() {
        if (!_this.isDestroyed && !_this.isDestroying) {
          _this.set('login_error', i18n.t('google_auth_failed', "Google sign-in failed. Please try again."));
        }
      });
    }
    this.ensureGoogleLinkLoaded();
    if(this.get('google_error') && !this.get('login_error')) {
      this.set('login_error', this.googleAuthErrorMessage(this.get('google_error')));
    }
    if(this.get('google_popout_id')) {
      var popoutId = this.get('google_popout_id');
      this.session.wait_for_token(popoutId).then(function(res) {
        if (!_this.isDestroyed && !_this.isDestroying) {
          _this.handle_auth(res);
        }
      }, function() {
        if (!_this.isDestroyed && !_this.isDestroying) {
          _this.set('login_error', i18n.t('token_not_retrieved', "Authorization never completed, please try again"));
        }
      });
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
      return;
    }
    _this.set('checking_for_secret', false);
    if(!_this.get('client_secret')) {
      _this.set('requesting', true);
      _this.session.check_token().then(function(result) {
        if (_this.isDestroyed || _this.isDestroying) {
          return;
        }
        var browserToken = result && result.browserToken || _this.persistence.getBrowserToken();
        if (browserToken && !_this.get('client_secret')) {
          _this.set('client_secret', browserToken);
          _this.set('client_id', 'browser');
        }
        _this.set('requesting', false);
        var retryDelay = (result && result.networkError) ? 5000 : 2000;
        var timeoutHandle = runLater(function() {
          if (!_this.isDestroyed && !_this.isDestroying) {
            _this.check_for_missing_token();
          }
        }, retryDelay);
        _this.get('pendingTimeouts').push(timeoutHandle);
      }, function() {
        if (_this.isDestroyed || _this.isDestroying) {
          return;
        }
        _this.set('requesting', false);
        var timeoutHandle = runLater(function() {
          if (!_this.isDestroyed && !_this.isDestroying) {
            _this.check_for_missing_token();
          }
        }, 5000);
        _this.get('pendingTimeouts').push(timeoutHandle);
      });
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
  googleAuthErrorMessage: function(code) {
    var map = {
      access_denied: ['google_auth_access_denied', "Google sign-in was cancelled."],
      no_account: ['google_auth_no_account', "No LingoLinq account found for this Google email. Please sign up first."],
      auth_failed: ['google_auth_failed', "Google sign-in failed. Please try again."],
      session_expired: ['google_link_session_expired', "This Google sign-in session expired. Please try again."],
      org_sso_required: ['google_auth_org_sso_required', "Your organization requires a different sign-in method."],
      unverified_email: ['google_auth_unverified_email', "Google did not verify this email address."],
      registration_failed: ['google_auth_failed', "Google sign-in failed. Please try again."]
    };
    var entry = map[code] || map.auth_failed;
    return i18n.t(entry[0], entry[1]);
  },
  loadGoogleLinkCandidates: function() {
    var _this = this;
    var nonce = this.get('google_link_nonce');
    if(!nonce) { return; }
    this.set('google_link_state', { loading: true, candidates: [] });
    this.persistence.ajax('/auth/google/link?nonce=' + encodeURIComponent(nonce), { type: 'GET', dataType: 'json' }).then(function(res) {
      if (_this.isDestroyed || _this.isDestroying) { return; }
      if(!res || typeof res !== 'object' || res.error || !res.mode) {
        _this.expireGoogleLinkSession();
        return;
      }
      var candidates = res.candidates || [];
      _this.set('google_link_state', {
        loading: false,
        mode: res.mode,
        candidates: candidates,
        unlinked_candidates: res.unlinked_candidates || [],
        allow_manual_link: !!res.allow_manual_link,
        email: res.email,
        single_candidate: !!res.single_candidate || candidates.length === 1,
        selected_user_name: res.selected_user_name
      });
      if(res.selected_user_name) {
        _this.set('google_link_selected_user_name', res.selected_user_name);
      } else if(candidates.length === 1 && candidates[0].user_name) {
        _this.set('google_link_selected_user_name', candidates[0].user_name);
      }
    }, function() {
      if (_this.isDestroyed || _this.isDestroying) { return; }
      _this.expireGoogleLinkSession();
    });
  },
  googleLoginStartUrl: function(flow) {
    var url = '/auth/google/start?flow=' + encodeURIComponent(flow || 'login');
    url = url + '&device_id=' + encodeURIComponent(capabilities.device_id());
    url = url + '&return_origin=' + encodeURIComponent(window.location.origin);
    if(capabilities.installed_app) {
      url = url + '&app=true&popout_id=' + encodeURIComponent((new Date()).getTime() + 'T' + Math.round(Math.random() * 999999));
    }
    return url;
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
      window.location.assign(url);
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
        _this.router.transitionTo('login.device');
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
  coppaResendDisabled: computed('coppa_resend_busy', 'coppa_resend_cooldown_until', 'password', 'identification', function() {
    if (this.get('coppa_resend_busy')) {
      return true;
    }
    var until = this.get('coppa_resend_cooldown_until');
    if (until && Date.now() < until) {
      return true;
    }
    if (isEmpty(this.get('identification')) || isEmpty(this.get('password'))) {
      return true;
    }
    return false;
  }),
  coppaSubmitParentEmailDisabled: computed('coppa_submit_parent_busy', 'password', 'identification', 'parent_consent_email', function() {
    if (this.get('coppa_submit_parent_busy')) {
      return true;
    }
    if (isEmpty(this.get('identification')) || isEmpty(this.get('password'))) {
      return true;
    }
    if (isEmpty((this.get('parent_consent_email') || '').trim())) {
      return true;
    }
    return false;
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
  showDeviceStep: computed('login_followup', 'deviceStep', function() {
    return this.get('login_followup') || this.get('deviceStep');
  }),
  googleSsoEnabled: computed('app_state.feature_flags.google_sso', function() {
    return !!this.get('app_state.feature_flags.google_sso');
  }),
  showGoogleLinkStep: computed('google_link_nonce', 'google_link_state', function() {
    return !!this.get('google_link_nonce');
  }),
  googleLinkStepLoading: computed('google_link_state', 'google_link_nonce', function() {
    if(!this.get('google_link_nonce')) { return false; }
    var state = this.get('google_link_state');
    return !state || !!state.loading || (!state.mode && !state.error);
  }),
  googleLinkMode: computed('google_link_state.mode', 'google_link_state.loading', function() {
    var state = this.get('google_link_state');
    if(!state || state.loading || !state.mode) { return null; }
    return state.mode;
  }),
  googleLinkManualMode: computed('googleLinkMode', function() {
    return this.get('googleLinkMode') === 'manual_link';
  }),
  googleLinkAccountSelectMode: computed('googleLinkMode', function() {
    return this.get('googleLinkMode') === 'account_select';
  }),
  googleLinkNeedsPicker: computed('google_link_state.candidates.[]', 'google_link_state.single_candidate', 'googleLinkMode', function() {
    var mode = this.get('googleLinkMode');
    var state = this.get('google_link_state') || {};
    var candidates = state.candidates || [];
    if(mode === 'account_select') {
      return candidates.length > 1;
    }
    if(mode !== 'email_match') { return false; }
    return candidates.length > 1 && !state.single_candidate;
  }),
  googleLinkUnlinkedCandidates: computed('google_link_state.unlinked_candidates.[]', function() {
    return (this.get('google_link_state') || {}).unlinked_candidates || [];
  }),
  googleLinkHasUnlinkedCandidates: computed('googleLinkUnlinkedCandidates.[]', function() {
    return this.get('googleLinkUnlinkedCandidates.length') > 0;
  }),
  googleLinkUnlinkedNeedsPicker: computed('googleLinkUnlinkedCandidates.[]', function() {
    return this.get('googleLinkUnlinkedCandidates.length') > 1;
  }),
  googleLinkShowLinkAnother: computed('googleLinkAccountSelectMode', 'google_link_state.allow_manual_link', 'google_link_linking_another', function() {
    return this.get('googleLinkAccountSelectMode') && this.get('google_link_state.allow_manual_link') && !this.get('google_link_linking_another');
  }),
  googleLinkSelectedIsLinked: computed('google_link_selected_user_name', 'google_link_state.candidates.[]', function() {
    var selected = this.get('google_link_selected_user_name');
    if(!selected) { return false; }
    return (this.get('google_link_state.candidates') || []).some(function(c) { return c.user_name === selected; });
  }),
  googleLinkConfirmIsSignIn: computed('googleLinkAccountSelectMode', 'googleLinkSelectedIsLinked', 'google_link_linking_another', function() {
    return this.get('googleLinkAccountSelectMode') && this.get('googleLinkSelectedIsLinked') && !this.get('google_link_linking_another');
  }),
  googleLinkDisplayCandidates: computed('google_link_state.candidates.[]', 'googleLinkMode', function() {
    var mode = this.get('googleLinkMode');
    if(mode !== 'email_match' && mode !== 'account_select') { return []; }
    return (this.get('google_link_state') || {}).candidates || [];
  }),
  googleLinkEmailMatchCandidates: computed('googleLinkDisplayCandidates.[]', 'googleLinkMode', function() {
    if(this.get('googleLinkMode') !== 'email_match') { return []; }
    return this.get('googleLinkDisplayCandidates') || [];
  }),
  googleLinkShowsCandidateList: computed('googleLinkDisplayCandidates.[]', 'googleLinkMode', function() {
    var mode = this.get('googleLinkMode');
    if(mode !== 'email_match' && mode !== 'account_select') { return false; }
    return this.get('googleLinkDisplayCandidates.length') > 0;
  }),
  googleLinkShowsReadonlyCandidate: computed('googleLinkNeedsPicker', 'googleLinkShowsCandidateList', function() {
    return this.get('googleLinkShowsCandidateList') && !this.get('googleLinkNeedsPicker');
  }),
  googleLinkNeedsUsernameField: computed('googleLinkMode', 'googleLinkNeedsPicker', 'google_link_state.single_candidate', 'google_link_linking_another', function() {
    if(this.get('googleLinkMode') === 'manual_link') { return true; }
    if(this.get('googleLinkAccountSelectMode') && this.get('google_link_linking_another')) { return true; }
    return false;
  }),
  googleLinkNeedsPassword: computed('googleLinkMode', 'google_link_linking_another', 'google_link_selected_user_name', 'googleLinkSelectedIsLinked', function() {
    if(this.get('googleLinkMode') !== 'account_select') { return true; }
    if(this.get('google_link_linking_another')) { return true; }
    var selected = this.get('google_link_selected_user_name');
    if(!selected) { return false; }
    return !this.get('googleLinkSelectedIsLinked');
  }),
  googleLinkSingleUsername: computed('google_link_state.candidates.[]', 'google_link_state.selected_user_name', 'googleLinkMode', function() {
    var mode = this.get('googleLinkMode');
    if(mode !== 'email_match' && mode !== 'account_select') { return null; }
    var state = this.get('google_link_state') || {};
    if(state.selected_user_name) { return state.selected_user_name; }
    var candidates = state.candidates || [];
    if(candidates.length === 1 && candidates[0].user_name) {
      return candidates[0].user_name;
    }
    return null;
  }),
  googleLinkResolvedDisplayName: computed('google_link_state.candidates.[]', 'googleLinkResolvedUsername', function() {
    var username = this.get('googleLinkResolvedUsername');
    if(!username) { return null; }
    var candidates = (this.get('google_link_state') || {}).candidates || [];
    var match = candidates.find(function(c) { return c.user_name === username; });
    return match && match.display_name;
  }),
  googleLinkResolvedUsername: computed('google_link_selected_user_name', 'google_link_state.{selected_user_name,candidates.[]}', 'googleLinkNeedsPicker', 'googleLinkMode', 'googleLinkNeedsUsernameField', function() {
    if(this.get('googleLinkNeedsPicker') || this.get('googleLinkNeedsUsernameField')) { return null; }
    var selected = this.get('google_link_selected_user_name') || (this.get('google_link_state') || {}).selected_user_name;
    if(selected) { return selected; }
    return this.get('googleLinkSingleUsername');
  }),
  googleLinkSubmitDisabled: computed('google_link_state.linking', 'google_link_password', 'google_link_selected_user_name', 'googleLinkNeedsPicker', 'googleLinkNeedsUsernameField', 'googleLinkNeedsPassword', 'googleLinkAccountSelectMode', 'googleLinkUnlinkedNeedsPicker', 'googleLinkHasUnlinkedCandidates', 'google_link_linking_another', function() {
    if(this.get('google_link_state.linking')) { return true; }
    if(this.get('googleLinkAccountSelectMode')) {
      if(this.get('google_link_linking_another')) {
        if(isEmpty(this.get('google_link_selected_user_name'))) { return true; }
        return isEmpty(this.get('google_link_password'));
      }
      if(isEmpty(this.get('google_link_selected_user_name'))) {
        return this.get('googleLinkNeedsPicker') || this.get('googleLinkUnlinkedNeedsPicker') || this.get('googleLinkHasUnlinkedCandidates');
      }
      if(this.get('googleLinkNeedsPassword') && isEmpty(this.get('google_link_password'))) { return true; }
      return false;
    }
    if(this.get('googleLinkNeedsPassword') && isEmpty(this.get('google_link_password'))) { return true; }
    if(this.get('googleLinkNeedsPicker') && isEmpty(this.get('google_link_selected_user_name'))) { return true; }
    if(this.get('googleLinkNeedsUsernameField') && isEmpty(this.get('google_link_selected_user_name'))) { return true; }
    return false;
  }),
  noSubmit: computed('logging_in', 'logged_in', 'noSecret', 'redirecting', 'showDeviceStep', 'showGoogleLinkStep', function() {
    return this.get('noSecret') || this.get('redirecting') || this.get('logging_in') || this.get('logged_in') || this.get('showDeviceStep') || this.get('showGoogleLinkStep');
  }),
  noSecret: computed('client_secret', function() {
    return !this.get('client_secret');
  }),
  // SPA path eligibility predicate. Extracted as a method (not an inline
  // expression) so plan 07 tests can stub it directly without flipping the
  // global Ember.testing flag. Returns true iff the SPA transition path
  // should be taken on a non-installed-app web client.
  // SPEC R1, plan 04.
  _login_spa_eligible: function() {
    return !!this.appState.get('feature_flags.auth_spa_transition');
  },
  // Thin wrapper so plan-07 tests can observe post-auth reload navigation without
  // overriding window.location.assign (frozen in modern Chrome / Puppeteer).
  _login_location_assign: function(url) {
    if (isTesting()) { return; }
    location.assign(url);
  },
  // Post-auth web dispatch logic. Called from login_success's web `else`
  // branch (the existing branch after `if(isTesting()) ... else if(installed_app)`).
  // Extracted as a method so plan 07 tests can call it directly with a
  // stubbed `wait` promise — bypassing login_success's outer `if(isTesting())`
  // early-return without needing to mutate Ember.testing globally.
  // The method assumes:
  //   - reload=true (the reload=false case is handled in login_success itself)
  //   - we're on a web client (NOT installed_app — that branch is handled by
  //     login_success directly)
  //   - we're NOT under test environment (login_success's outer if(isTesting())
  //     short-circuits in production; in tests this method is called directly
  //     by the test, bypassing the outer guard intentionally for test purposes)
  // It dispatches to the SPA path if `_login_spa_eligible()` returns true,
  // else to the existing reload path. ANY error in the SPA path falls back
  // to the reload path.
  // SPEC R1, R3, R4. Plan 04.
  _login_dispatch_after_wait: function(wait) {
    var _this = this;
    var spaTransitionEnabled = !!_this._login_spa_eligible();

    var reloadDone = false;
    var doReload = function() {
      if(reloadDone || _this.isDestroyed || _this.isDestroying) { return; }
      reloadDone = true;
      if(_this.get('return')) {
        _this.session.set('return', true);
      }
      _this._login_location_assign('/');
    };

    var removePreReloadOverlay = function() {
      // The pre-reload overlay was appended to document.body (outside the
      // Ember outlet) by login_success. On the reload path, browser
      // navigation discards it. On the SPA path, we must remove it
      // explicitly AFTER the transition resolves, otherwise it stays
      // pinned over the dashboard.
      try {
        var ov = document.getElementById('ll-pre-reload-overlay');
        if(ov && ov.parentNode) {
          ov.parentNode.removeChild(ov);
        }
      } catch(e) { /* DOM may be unavailable; ignore */ }
    };

    var doTransition = function() {
      if(reloadDone || _this.isDestroyed || _this.isDestroying) { return; }
      reloadDone = true;
      try {
        // Transition to 'index' — the index route's afterModel
        // (routes/index.js:35-39) does replaceWith('user.home', user_name)
        // using the same code path as cold-boot. This avoids duplicate
        // findRecord('user', 'self') fetches and the username-changed
        // race that transitionTo('user.home', user_name) would introduce.

        // Keep the pre-reload overlay visible across the ENTIRE chained
        // transition (login -> index -> user.home). The transitionTo('index')
        // promise resolves before the chained replaceWith('user.home', ...)
        // settles, which would expose a blank moment + the index_loading
        // template's secondary "Loading..." overlay. Listen for routeDidChange
        // and dismiss only after the chain has been quiet for 150ms (= final
        // route settled). 2x rAF after that lets the destination paint.
        var routerSvc = _this.router;
        var pending = null;
        var safetyTimer = null;
        var listenerCleanedUp = false;
        // Bump the pre-reload overlay's z-index so it always wins regardless
        // of DOM order. Higher than the default .ll-premium-progress (z 10054).
        try {
          var preEl = document.getElementById('ll-pre-reload-overlay');
          if(preEl) { preEl.style.zIndex = '2147483646'; }
        } catch(e) {}
        var cleanup = function() {
          if(listenerCleanedUp) { return; }
          listenerCleanedUp = true;
          try { routerSvc.off('routeDidChange', onRouteDidChange); } catch(e) {}
          if(pending) { try { cancelLater(pending); } catch(e) {} pending = null; }
          if(safetyTimer) { try { cancelLater(safetyTimer); } catch(e) {} safetyTimer = null; }
        };
        var dismiss = function() {
          cleanup();
          if(_this.isDestroyed || _this.isDestroying) { return; }
          var raf = window.requestAnimationFrame;
          if(typeof raf === 'function') {
            raf(function() { raf(function() { removePreReloadOverlay(); }); });
          } else {
            removePreReloadOverlay();
          }
        };
        var onRouteDidChange = function() {
          if(listenerCleanedUp) { return; }
          if(pending) { try { cancelLater(pending); } catch(e) {} }
          pending = runLater(dismiss, 150);
        };
        routerSvc.on('routeDidChange', onRouteDidChange);
        // Safety net: if routeDidChange never fires (edge case), don't trap the
        // user behind the overlay forever.
        safetyTimer = runLater(dismiss, 8000);

        var promise = routerSvc.transitionTo('index');
        if(promise && typeof promise.then === 'function') {
          promise.then(null, function(err) {
            if(_this.isDestroyed || _this.isDestroying) { cleanup(); return; }
            // CRITICAL: TransitionAborted is the EXPECTED rejection when
            // index's afterModel calls replaceWith('user.home', ...) — Ember
            // marks the original transition as aborted, but the chain still
            // succeeds and routeDidChange will fire for user.home. Treating
            // this as a failure and reloading produces exactly the bug we
            // are trying to fix (mid-chain page reload → white flash →
            // index-loading overlay → dashboard). Recognize it and bail out.
            var errName = err && (err.name || (err.constructor && err.constructor.name));
            var errMsg = err && err.message;
            var isTransitionAborted = errName === 'TransitionAborted' ||
                                       (errMsg && /TransitionAborted|transition.*aborted/i.test(errMsg));
            if(isTransitionAborted) {
              return;
            }
            console.warn('[login_success] SPA transition rejected, falling back to reload', err);
            cleanup();
            reloadDone = false;
            doReload();
          });
        }
      } catch(err) {
        console.warn('[login_success] SPA transition threw, falling back to reload', err);
        reloadDone = false;
        doReload();
      }
    };

    var doNext = spaTransitionEnabled ? doTransition : doReload;

    wait.then(doNext, function(err) {
      if(_this.isDestroyed || _this.isDestroying) { return; }
      console.warn('[login_success] User fetch failed, reloading', err);
      doReload();
    });
    // Fallback: if wait hangs (e.g. slow API, IndexedDB), reload after 6s.
    // The race ALWAYS falls back to doReload — never to doTransition — because
    // a hanging wait means the SPA path cannot satisfy its preconditions.
    var timeoutPromise = new RSVP.Promise(function(resolve) { runLater(resolve, 6000); });
    RSVP.race([wait, timeoutPromise]).then(doNext, function() { doReload(); });
  },

  init() {
    this._super(...arguments);
    var self = this;
    var send = function(name) {
      var args = Array.prototype.slice.call(arguments, 1);
      self.send.apply(self, [name].concat(args));
    };
    this.loginFollowupTrue = () => { send('login_followup', true); };
    this.loginFollowupFalse = () => { send('login_followup', false); };
    this.loginForceLogoutYes = () => { send('login_force_logut', true); };
    this.loginForceLogoutNo = () => { send('login_force_logut', false); };
    this.onGoogleLinkUserSelect = (event) => {
      var userName = event && event.target && event.target.value;
      if (userName) { send('select_google_link_user', userName); }
    };
    this.onGoogleLinkUserPick = (event) => {
      var userName = event && event.target && event.target.value;
      if (userName) { self.set('google_link_selected_user_name', userName); }
    };
    this.onAuthenticateSubmit = (event) => {
      if (event && event.preventDefault) { event.preventDefault(); }
      send('authenticate');
    };
    this.onConfirmGoogleLink = () => { send('confirm_google_link'); };
    this.onCancelGoogleLink = () => { send('cancel_google_link'); };
    this.onStartGoogleLinkAnother = () => { send('start_google_link_another'); };
    this.onStartGoogleSignup = () => { send('start_google_signup'); };
    this.onConfirm2fa = () => { send('confirm_2fa'); };
    this.onResendParentConsentEmail = () => { send('resendParentConsentEmail'); };
    this.onSubmitParentConsentEmail = () => { send('submitParentConsentEmail'); };
    this.onLogout = () => { send('logout'); };
    this.onContinueWithGoogle = (event) => { send('continue_with_google', event); };
  },

  actions: {
    login_success: function(reload) {
      var _this = this;

      var auth_settings = _this.stashes.get_object('auth_settings', true) || {};
      
      // Store the token temporarily so we don't lose it during flush
      var saved_token = auth_settings.access_token;
      var saved_user_name = auth_settings.user_name;
      var saved_user_id = auth_settings.user_id;

      // When reload is false: we're showing "Trust this device" / "Shared device" UI.
      // Restore session so API calls and navbar reflect authenticated state while the dialog is shown.
      if(!reload) {
        if(saved_token) {
          capabilities.access_token = saved_token;
          if(capabilities.sync_access_token) { capabilities.sync_access_token(); }
          _this.session.set('isAuthenticated', true);
          _this.session.set('access_token', saved_token);
          _this.session.set('user_name', saved_user_name);
          _this.session.set('user_id', saved_user_id);
        }
        _this.set('logging_in', false);
        _this.appState.set('logging_in', false);
        return;
      }

      // Restore session early so if we transition before wait completes (e.g. fallback timeout),
      // the index route will see isAuthenticated/access_token and load the user correctly
      if(saved_token) {
        capabilities.access_token = saved_token;
        if(capabilities.sync_access_token) { capabilities.sync_access_token(); }
        _this.session.set('isAuthenticated', true);
        _this.session.set('access_token', saved_token);
        _this.session.set('user_name', saved_user_name);
        _this.session.set('user_id', saved_user_id);
      }

      if(reload) {
        if(window.navigator.splashscreen) {
          window.navigator.splashscreen.show();
        }
        // Pre-reload progress card — covers the brief window between
        // login submit and the page reload that location.assign('/')
        // triggers. Without this, the user sees a blank/white moment
        // during browser navigation. The card visually MATCHES the
        // progress card baked into the post-reload bootstrap skeleton
        // (boards/index.html.erb in prod, app/frontend/app/index.html
        // in dev), so the user perceives one continuous loading state
        // across the reload boundary — not two distinct overlays.
        //
        // The chrome is the frosted-glass progress card (no full
        // skeleton behind it — the form is still visible underneath,
        // dimmed by the backdrop). After reload, the full skeleton +
        // progress card renders on the new page.
        if(typeof document !== 'undefined' && document.body && !document.getElementById('ll-pre-reload-overlay')) {
          var overlay = document.createElement('div');
          overlay.id = 'll-pre-reload-overlay';
          overlay.setAttribute('role', 'status');
          overlay.setAttribute('aria-live', 'polite');
          overlay.setAttribute('aria-busy', 'true');
          // Inline styles — these match the .ll-skel-progress chrome in
          // the bootstrap skeleton + the dim backdrop pattern from
          // .ll-premium-progress. Inline because we can't depend on
          // SCSS class authorship matching during the brief pre-reload
          // window across all environments.
          overlay.style.cssText = [
            'position:fixed','inset:0','z-index:2147483646',
            'background:rgba(15, 23, 42, 0.45)',
            'backdrop-filter:blur(6px)','-webkit-backdrop-filter:blur(6px)',
            'display:flex','align-items:center','justify-content:center',
            'font-family:Lexend, "Atkinson Hyperlegible", system-ui, sans-serif'
          ].join(';');
          var card = document.createElement('div');
          card.style.cssText = [
            'width:calc(100% - 32px)','max-width:480px',
            'padding:36px 40px 32px','border-radius:28px',
            'background:rgba(255, 255, 255, 0.92)',
            'backdrop-filter:blur(20px) saturate(140%)',
            '-webkit-backdrop-filter:blur(20px) saturate(140%)',
            'border:1px solid rgba(255, 255, 255, 0.8)',
            'box-shadow:0 1px 3px rgba(15, 23, 42, 0.04), 0 12px 32px rgba(15, 23, 42, 0.10), 0 32px 64px rgba(15, 23, 42, 0.08)',
            'text-align:center'
          ].join(';');
          var title = document.createElement('h2');
          title.id = 'll-pre-reload-overlay__title';
          title.textContent = i18n.t('preparing_your_workspace', 'Preparing your workspace');
          title.style.cssText = 'margin:0 0 8px;font-size:19px;font-weight:500;letter-spacing:0.005em;color:#1B365D;line-height:1.3;transition:opacity 0.3s ease';
          var sub = document.createElement('p');
          sub.id = 'll-pre-reload-overlay__sub';
          sub.textContent = i18n.t('loading_boards_and_resources', 'Loading boards and communication resources');
          sub.style.cssText = 'margin:0 0 22px;font-size:14px;font-weight:400;letter-spacing:0.01em;color:rgba(27, 54, 93, 0.65);line-height:1.5;transition:opacity 0.3s ease';
          var bar = document.createElement('div');
          bar.setAttribute('aria-hidden', 'true');
          bar.style.cssText = 'position:relative;width:100%;height:4px;border-radius:999px;background:rgba(27, 54, 93, 0.08);overflow:hidden';
          var swipe = document.createElement('div');
          swipe.style.cssText = 'position:absolute;inset:0;border-radius:999px;background:linear-gradient(90deg, rgba(42, 157, 143, 0) 0%, #2A9D8F 25%, #4C86D8 75%, rgba(76, 134, 216, 0) 100%);transform:translateX(-100%);animation:ll-pre-reload-sweep 2.2s cubic-bezier(0.4, 0.0, 0.2, 1) infinite';
          bar.appendChild(swipe);
          card.appendChild(title);
          card.appendChild(sub);
          card.appendChild(bar);
          overlay.appendChild(card);
          // Inject keyframes once.
          if(!document.getElementById('ll-pre-reload-keyframes')) {
            var style = document.createElement('style');
            style.id = 'll-pre-reload-keyframes';
            style.textContent = '@keyframes ll-pre-reload-sweep { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }';
            document.head.appendChild(style);
          }
          document.body.appendChild(overlay);
          // Dynamic message swap at 3s — matches the post-reload skeleton's
          // behavior. Soft "still working" copy reduces perceived frustration
          // on slow connections.
          setTimeout(function() {
            var t = document.getElementById('ll-pre-reload-overlay__title');
            var s = document.getElementById('ll-pre-reload-overlay__sub');
            if(t) { t.textContent = i18n.t('still_working_loading', 'Still working…'); }
            if(s) { s.textContent = i18n.t('large_board_sets_take_longer', 'Large board sets can take a little longer to prepare.'); }
          }, 3000);
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
          // Web (non-installed-app): delegate dispatch to _login_dispatch_after_wait
          // so plan 07 tests can call it directly with a stubbed wait promise.
          _this._login_dispatch_after_wait(wait);
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
          setErrorState(i18n.t('user_retrieve_failed_token', "Retrieving login settings failed - authentication token not available"));
          return;
        }
        
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
            setErrorState(i18n.t('user_update_failed', "Updating login settings failed"));
          });
        }, function(err) {
          setErrorState(i18n.t('user_retrieve_failed', "Retrieving login settings failed"));
        });
      }, function(error) {
        // Handle token fetch failure
        if (_this.isDestroyed || _this.isDestroying) {
          return;
        }
        console.warn('[login-form.login_followup] Token ensure failed', error);
        setErrorState(i18n.t('user_retrieve_failed_token', "Retrieving login settings failed - authentication token not available"));
      });
    },
    logout: function() {
      this.session.invalidate(true);
    },
    continue_with_google: function(event) {
      if(this.get('noSecret')) {
        if(event && event.preventDefault) {
          event.preventDefault();
        }
        return false;
      }
      if(event && event.preventDefault) {
        event.preventDefault();
      }
      this.redirect_login(this.googleLoginStartUrl('login'));
      return false;
    },
    confirm_google_link: function() {
      var _this = this;
      _this.set('google_link_state.linking', true);
      _this.set('google_link_error', null);
      _this.persistence.ajax('/auth/google/link', {
        type: 'POST',
        data: {
          nonce: _this.get('google_link_nonce'),
          user_name: _this.get('google_link_selected_user_name') || '',
          password: _this.get('google_link_password') || ''
        }
      }).then(function(res) {
        if (_this.isDestroyed || _this.isDestroying) {
          return;
        }
        _this.set('google_link_state.linking', false);
        if(res.token) {
          _this.session.confirm_authentication(res.token).then(function() {
            _this.clearGoogleLinkSession();
            _this.handle_auth(res.token);
          }, function() {
            _this.set('google_link_error', i18n.t('google_auth_failed', "Google sign-in failed. Please try again."));
          });
        } else if(res.tmp_token) {
          _this.check_tmp_token(res.tmp_token).then(function() {
            _this.clearGoogleLinkSession();
          }, function() {
            _this.set('google_link_error', i18n.t('google_auth_failed', "Google sign-in failed. Please try again."));
          });
        } else if(res.redirect) {
          var match = res.redirect.match(/\?auth-([^_]+)_/);
          if(match) {
            _this.check_tmp_token(match[1]).then(function() {
              _this.clearGoogleLinkSession();
            }, function() {
              _this.set('google_link_error', i18n.t('google_auth_failed', "Google sign-in failed. Please try again."));
            });
          }
        }
      }, function(xhr) {
        if (_this.isDestroyed || _this.isDestroying) {
          return;
        }
        _this.set('google_link_state.linking', false);
        var json = (xhr && xhr.responseJSON) || {};
        if(xhr && xhr.responseText && !json.error) {
          try {
            json = JSON.parse(xhr.responseText) || json;
          } catch (e) { /* ignore */ }
        }
        if(json.error === 'invalid_password') {
          _this.set('google_link_error', i18n.t('google_link_invalid_password', "Password not accepted"));
        } else if(json.error === 'session_expired') {
          _this.set('google_link_error', i18n.t('google_link_session_expired', "This Google sign-in session expired. Please try again."));
        } else {
          _this.set('google_link_error', i18n.t('google_auth_failed', "Google sign-in failed. Please try again."));
        }
      });
    },
    cancel_google_link: function() {
      this.clearGoogleLinkSession();
      this.set('google_link_state', null);
      this.set('google_link_password', null);
      this.set('google_link_selected_user_name', null);
      this.set('google_link_error', null);
      this.set('google_link_linking_another', false);
    },
    select_google_link_user: function(userName) {
      this.set('google_link_selected_user_name', userName);
      this.set('google_link_linking_another', false);
      this.set('google_link_password', null);
      this.set('google_link_error', null);
    },
    start_google_link_another: function() {
      this.set('google_link_linking_another', true);
      this.set('google_link_selected_user_name', null);
      this.set('google_link_password', null);
      this.set('google_link_error', null);
    },
    start_google_signup: function() {
      var nonce = this.get('google_link_nonce');
      if(!nonce) { return; }
      location.href = '/register?google_signup=' + encodeURIComponent(nonce);
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
      this.set('coppa_awaiting_parent', false);
      this.set('coppa_needs_parent_email', false);
      this.set('coppa_resend_notice', null);
      this.set('coppa_submit_parent_notice', null);
      var _this = this;
      var data = this.getProperties('identification', 'password', 'client_secret', 'long_token', 'browserless');
      if(capabilities.browserless || capabilities.installed_app) {
        data.long_token = true;
        data.browserless = true;
      }
      if (!isEmpty(data.identification) && !isEmpty(data.password)) {
        _this.set('login_followup_already_long_token', false);
        _this.session.authenticate(data).then(function(data) {
          _this.set('password', null);
          if(data.redirect) {
            _this.redirect_login(data.redirect);
          } else {
            _this.handle_auth(data);
          }
        }, function(err) {
          err = err || {};
          _this.set('logging_in', false);
          _this.appState.set('logging_in', false);
          if(err.error == "Invalid authentication attempt") {
            _this.set('login_error', i18n.t('invalid_login', "Invalid user name or password"));
          } else if(err.coppa_parental_consent_revoked) {
            _this.set('coppa_awaiting_parent', false);
            _this.set('coppa_needs_parent_email', true);
            _this.set('login_error', i18n.t('coppa_login_blocked_parent_consent_revoked', "A parent or guardian withdrew consent for this account. It cannot be used until consent is given again."));
          } else if(err.coppa_parental_consent_declined) {
            _this.set('coppa_awaiting_parent', false);
            _this.set('coppa_needs_parent_email', false);
            _this.set('login_error', i18n.t('coppa_login_blocked_parent_consent_declined', "A parent or guardian declined consent for this account. It is scheduled for deletion and cannot be used."));
          } else if(err.coppa_parent_email_required) {
            _this.set('coppa_awaiting_parent', false);
            _this.set('coppa_needs_parent_email', true);
            _this.set('login_error', i18n.t('coppa_login_needs_parent_email', "A parent or guardian email is required before this account can be used. Enter it below so we can send an approval request."));
          } else if(err.coppa_parental_consent_pending) {
            _this.set('coppa_needs_parent_email', false);
            _this.set('coppa_awaiting_parent', true);
            _this.set('login_error', i18n.t('coppa_login_blocked_until_parent_consent', "This account is waiting for a parent or guardian to approve it. Ask them to check their email for the approval link."));
          } else if(err.error == "Invalid client secret") {
            _this.set('login_error', i18n.t('expired_login', "Your login token is expired, please try again"));
          } else if(err.error && err.error.match(/user name was changed/i) && err.user_name) {
            _this.set('login_error', i18n.t('user_name_changed', "NOTE: User name has changed to \"%{un}\"", {un: err.user_name}));
          } else {
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
    },
    resendParentConsentEmail: function() {
      var _this = this;
      if (!_this.get('coppa_awaiting_parent') || _this.get('coppaResendDisabled')) {
        return;
      }
      _this.set('coppa_resend_busy', true);
      _this.set('coppa_resend_notice', null);
      var identification = _this.get('identification');
      var token = _this.get('client_secret');
      _this.session.hashed_password(_this.get('password')).then(function(pw) {
        return _this.persistence.ajax('/api/v1/users/resend_parental_consent', {
          type: 'POST',
          data: {
            client_id: 'browser',
            client_secret: token,
            username: identification,
            password: pw
          }
        });
      }).then(function() {
        if (_this.isDestroyed || _this.isDestroying) {
          return;
        }
        _this.set('coppa_resend_busy', false);
        _this.set('coppa_resend_notice', i18n.t('coppa_parent_email_resent', "If that email address is correct, the parent or guardian should receive another message shortly."));
        var ms = 60 * 1000;
        _this.set('coppa_resend_cooldown_until', Date.now() + ms);
        var h = runLater(function() {
          if (!_this.isDestroyed && !_this.isDestroying) {
            _this.set('coppa_resend_cooldown_until', null);
          }
        }, ms);
        _this.get('pendingTimeouts').push(h);
      }, function(xhr) {
        if (_this.isDestroyed || _this.isDestroying) {
          return;
        }
        _this.set('coppa_resend_busy', false);
        if (xhr && xhr.short_circuit) {
          _this.set('coppa_resend_notice', i18n.t('coppa_parent_email_resend_offline', "You appear to be offline. Check your connection and try again."));
          return;
        }
        var json = (xhr && xhr.responseJSON) || {};
        if (xhr && xhr.responseText && (!json || !json['error'])) {
          try {
            json = JSON.parse(xhr.responseText) || json;
          } catch (e) { /* ignore */ }
        }
        var status = xhr && xhr.status;
        // api_error may render HTTP 200 when X-Has-AppCache is set; body still has error + status 429.
        var throttled = (status === 429) ||
          json['error'] === 'parental_consent_resend_throttled' ||
          json['status'] === 429;
        if (throttled) {
          var sec = parseInt(json['retry_after_seconds'], 10);
          if (!Number.isFinite(sec) || sec < 1) {
            sec = 180;
          }
          _this.set('coppa_resend_notice', i18n.t('coppa_parent_email_resend_wait', "Please wait %{sec} seconds before requesting another email.", {sec: sec}));
          _this.set('coppa_resend_cooldown_until', Date.now() + (sec * 1000));
          var h2 = runLater(function() {
            if (!_this.isDestroyed && !_this.isDestroying) {
              _this.set('coppa_resend_cooldown_until', null);
              _this.set('coppa_resend_notice', null);
            }
          }, sec * 1000);
          _this.get('pendingTimeouts').push(h2);
          return;
        }
        if (json['coppa_parent_email_required']) {
          _this.set('coppa_awaiting_parent', false);
          _this.set('coppa_needs_parent_email', true);
          _this.set('login_error', i18n.t('coppa_login_needs_parent_email', "A parent or guardian email is required before this account can be used. Enter it below so we can send an approval request."));
          return;
        }
        _this.set('coppa_resend_notice', i18n.t('coppa_parent_email_resend_failed', "Could not resend the email. Check your username and password, then try again."));
      });
    },
    submitParentConsentEmail: function() {
      var _this = this;
      if (!_this.get('coppa_needs_parent_email') || _this.get('coppaSubmitParentEmailDisabled')) {
        return;
      }
      _this.set('coppa_submit_parent_busy', true);
      _this.set('coppa_submit_parent_notice', null);
      var identification = _this.get('identification');
      var token = _this.get('client_secret');
      var parentEmail = (_this.get('parent_consent_email') || '').trim();
      _this.session.hashed_password(_this.get('password')).then(function(pw) {
        return _this.persistence.ajax('/api/v1/users/submit_parental_consent_email', {
          type: 'POST',
          data: {
            client_id: 'browser',
            client_secret: token,
            username: identification,
            password: pw,
            parent_consent_email: parentEmail
          }
        });
      }).then(function() {
        if (_this.isDestroyed || _this.isDestroying) {
          return;
        }
        _this.set('coppa_submit_parent_busy', false);
        _this.set('coppa_needs_parent_email', false);
        _this.set('coppa_awaiting_parent', true);
        _this.set('login_error', i18n.t('coppa_login_blocked_until_parent_consent', "This account is waiting for a parent or guardian to approve it. Ask them to check their email for the approval link."));
        _this.set('coppa_submit_parent_notice', i18n.t('coppa_parent_email_submitted', "We sent an approval request to that parent or guardian email."));
        _this.set('coppa_resend_notice', i18n.t('coppa_parent_email_submitted', "We sent an approval request to that parent or guardian email."));
      }, function(xhr) {
        if (_this.isDestroyed || _this.isDestroying) {
          return;
        }
        _this.set('coppa_submit_parent_busy', false);
        if (xhr && xhr.short_circuit) {
          _this.set('coppa_submit_parent_notice', i18n.t('coppa_parent_email_resend_offline', "You appear to be offline. Check your connection and try again."));
          return;
        }
        var json = (xhr && xhr.responseJSON) || {};
        if (xhr && xhr.responseText && (!json || !json['error'])) {
          try {
            json = JSON.parse(xhr.responseText) || json;
          } catch (e) { /* ignore */ }
        }
        if (json['invalid_parent_consent_email']) {
          _this.set('coppa_submit_parent_notice', i18n.t('coppa_parent_email_invalid', "Please enter a valid parent or guardian email that is different from the account email."));
          return;
        }
        _this.set('coppa_submit_parent_notice', i18n.t('coppa_parent_email_submit_failed', "Could not send the approval email. Check your username, password, and the parent email, then try again."));
      });
    }
  }
});
