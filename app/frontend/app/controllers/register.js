import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import LingoLinq from '../app';
import { computed, observer } from '@ember/object';
import persistence from '../utils/persistence';
import capabilities from '../utils/capabilities';

// TODO: Maybe a pretty img they can send/embed to share with users

export default Controller.extend({
  stashes: service('stashes'),
  persistence: service('persistence'),
  appState: service('app-state'),
  session: service('session'),
  title: "Register",
  queryParams: ['code', 'v', 'google_signup'],
  googleSignupProfile: null,
  googleSignupBusy: false,
  googleSignupError: null,
  googleSignupUserName: '',
  googleSignupRegistrationType: 'individual',
  googleSignupTerms: false,
  googleSignupTelemetryOptIn: false,
  googleSignupCommsLogOptIn: false,
  showGoogleSignup: computed('google_signup', 'googleSignupProfile', function() {
    return !!(this.get('google_signup') && this.get('googleSignupProfile'));
  }),
  googleSignupSubmitDisabled: computed('googleSignupBusy', 'googleSignupUserName', 'googleSignupTerms', 'showCoppaConsent', 'coppa_age_group', 'age_attested', function() {
    if(this.get('googleSignupBusy')) { return true; }
    if(!this.get('googleSignupTerms')) { return true; }
    if((this.get('googleSignupUserName') || '').trim().length === 0) { return true; }
    if(this.get('showCoppaConsent')) {
      if(!this.get('coppa_age_group')) { return true; }
      if(this.get('coppa_age_group') === 'under_13') { return true; }
    } else {
      // Mainline (non-COPPA) path: require explicit 13+ attestation.
      // When `showCoppaConsent` is true the radio-button flow above
      // already gates age, so don't double-require this checkbox.
      if(!this.get('age_attested')) { return true; }
    }
    return false;
  }),
  registration_types: LingoLinq.registrationTypes,
  triedToSave: false,
  badEmail: computed('model.email', 'triedToSave', function() {
    var email = this.get('model.email');
    return (this.get('triedToSave') && !email);
  }),
  shortPassword: computed('model.password', 'model.password2', 'triedToSave', function() {
    var password = this.get('model.password') || '';
    var password2 = this.get('model.password2');
    return (this.get('triedToSave') || password == password2) && password.length < 6;
  }),
  noName: computed('model.name', 'model.user_name', 'triedToSave', function() {
    var name = this.get('model.name');
    var user_name = this.get('model.user_name');
    return this.get('triedToSave') && !name && !user_name;
  }),
  noSpacesName: computed('model.user_name', function() {
    return !!(this.get('model.user_name') || '').match(/[\s\.'"]/);
  }),
  showCoppaConsent: computed('appState.domain_settings', function() {
    var ds = this.get('appState.domain_settings');
    return !!(ds && ds.coppa_parental_consent);
  }),
  coppa_age_group: null,
  parent_consent_email: '',
  coppaAgeRequired: computed('triedToSave', 'coppa_age_group', 'showCoppaConsent', function() {
    if(!this.get('showCoppaConsent')) { return false; }
    return this.get('triedToSave') && !this.get('coppa_age_group');
  }),
  coppaParentEmailMissing: computed('triedToSave', 'coppa_age_group', 'parent_consent_email', 'showCoppaConsent', function() {
    if(!this.get('showCoppaConsent') || this.get('coppa_age_group') !== 'under_13') { return false; }
    return this.get('triedToSave') && !(this.get('parent_consent_email') || '').trim();
  }),
  coppaParentEmailSameAsAccount: computed('triedToSave', 'coppa_age_group', 'parent_consent_email', 'model.email', 'showCoppaConsent', function() {
    if(!this.get('showCoppaConsent') || this.get('coppa_age_group') !== 'under_13') { return false; }
    if(!this.get('triedToSave')) { return false; }
    var pe = (this.get('parent_consent_email') || '').trim().toLowerCase();
    var ce = (this.get('model.email') || '').trim().toLowerCase();
    return !!(pe && ce && pe === ce);
  }),
  coppaBlocksSave: computed('triedToSave', 'showCoppaConsent', 'coppa_age_group', 'parent_consent_email', 'model.email', function() {
    if(!this.get('triedToSave') || !this.get('showCoppaConsent')) { return false; }
    if(!this.get('coppa_age_group')) { return true; }
    if(this.get('coppa_age_group') !== 'under_13') { return false; }
    var pe = (this.get('parent_consent_email') || '').trim();
    var ce = (this.get('model.email') || '').trim().toLowerCase();
    if(!pe) { return true; }
    if(pe.toLowerCase() === ce) { return true; }
    return false;
  }),
  // Mainline 13+ attestation. Required only when the COPPA flow is
  // OFF (domains without parental-consent UI). The COPPA-enabled path
  // already handles age via the radio-group at register.hbs:144-178,
  // so we don't double-gate. `age_attested` is checkbox-bound;
  // `ageAttestationRequired` shows the inline error message when the
  // user tried to submit without checking.
  age_attested: false,
  // Combined consent — the single checkbox on the register form now
  // confirms BOTH age (13+) and ToS agreement. Reading returns true
  // only when both underlying flags are set; writing mirrors the new
  // value into both, so all existing validation gates (ageBlocksSave,
  // googleSignupSubmitDisabled, the submit path that reads
  // model.terms_agree) continue to work unchanged. The Google-signup
  // variant has its own pair (age_attested + googleSignupTerms).
  combined_consent: computed('age_attested', 'model.terms_agree', {
    get() {
      return !!this.get('age_attested') && !!this.get('model.terms_agree');
    },
    set(key, value) {
      var v = !!value;
      this.set('age_attested', v);
      this.set('model.terms_agree', v);
      return v;
    }
  }),
  combined_google_consent: computed('age_attested', 'googleSignupTerms', {
    get() {
      return !!this.get('age_attested') && !!this.get('googleSignupTerms');
    },
    set(key, value) {
      var v = !!value;
      this.set('age_attested', v);
      this.set('googleSignupTerms', v);
      return v;
    }
  }),
  ageAttestationRequired: computed('triedToSave', 'age_attested', 'showCoppaConsent', function() {
    if(this.get('showCoppaConsent')) { return false; }
    return this.get('triedToSave') && !this.get('age_attested');
  }),
  ageBlocksSave: computed('triedToSave', 'showCoppaConsent', 'age_attested', function() {
    if(!this.get('triedToSave') || this.get('showCoppaConsent')) { return false; }
    return !this.get('age_attested');
  }),
  googleSsoEnabled: computed('appState.feature_flags.google_sso', function() {
    return !!this.get('appState.feature_flags.google_sso');
  }),
  googleRegisterAllowed: computed('model.terms_agree', 'showCoppaConsent', 'coppa_age_group', 'googleSsoEnabled', function() {
    if(!this.get('googleSsoEnabled')) { return false; }
    if(!this.get('model.terms_agree')) { return false; }
    if(this.get('showCoppaConsent') && this.get('coppa_age_group') === 'under_13') { return false; }
    if(this.get('showCoppaConsent') && !this.get('coppa_age_group')) { return false; }
    return true;
  }),
  googleRegisterDisabled: computed('googleRegisterAllowed', function() {
    return !this.get('googleRegisterAllowed');
  }),
  clear_start_code_ref: observer('model.start_code', 'start_code_ref', function() {
    if(this.get('model.start_code') && this.get('model.start_code') != this.get('start_code_ref.code')) {
      this.set('start_code_ref', null);
    }
  }),
  start_code_lookup: function() {
    var _this = this;
    _this.set('start_code', true);
    var code = this.get('model.reg_params.code');
    _this.set('model.start_code', code);
    persistence.ajax('/api/v1/start_code?code=' + encodeURIComponent(this.get('model.reg_params.code')) + '&v=' + this.get('model.reg_params.v'), {type: 'GET'}).then(function(res) {
      _this.set('start_code_ref', res);
    }, function(err) {
      
    });
  },
  loadGoogleSignup: function() {
    var _this = this;
    var nonce = this.get('google_signup');
    if(!nonce) { return; }
    this.set('googleSignupBusy', true);
    this.set('googleSignupError', null);
    this.persistence.ajax('/auth/google/signup?nonce=' + encodeURIComponent(nonce), { type: 'GET' }).then(function(res) {
      if(_this.isDestroyed || _this.isDestroying) { return; }
      _this.set('googleSignupProfile', res);
      _this.set('googleSignupBusy', false);
      if(res.name && !_this.get('googleSignupUserName')) {
        _this.set('googleSignupUserName', '');
      }
    }, function() {
      if(_this.isDestroyed || _this.isDestroying) { return; }
      _this.set('googleSignupBusy', false);
      _this.set('googleSignupError', true);
    });
  },
  actions: {
    allow_start_code: function() {
      this.set('start_code', !this.get('start_code'));
    },
    continue_with_google: function() {
      if(!this.get('googleRegisterAllowed') || !this.persistence.get('online')) { return; }
      var url = '/auth/google/start?flow=register&device_id=' + encodeURIComponent(capabilities.device_id());
      url = url + '&return_origin=' + encodeURIComponent(window.location.origin);
      if(capabilities.installed_app) {
        url = url + '&app=true&popout_id=' + encodeURIComponent((new Date()).getTime() + 'T' + Math.round(Math.random() * 999999));
        window.open(url, '_blank');
      } else {
        location.href = url;
      }
    },
    saveGoogleSignup: function() {
      var _this = this;
      if(_this.get('googleSignupSubmitDisabled')) { return; }
      _this.set('googleSignupBusy', true);
      _this.set('googleSignupError', null);
      _this.persistence.ajax('/auth/google/signup', {
        type: 'POST',
        data: {
          nonce: _this.get('google_signup'),
          user_name: (_this.get('googleSignupUserName') || '').trim(),
          registration_type: _this.get('googleSignupRegistrationType') || 'individual',
          terms_agree: _this.get('googleSignupTerms') ? 'true' : 'false',
          telemetry_opt_in: _this.get('googleSignupTelemetryOptIn') ? 'true' : 'false',
          comms_log_opt_in: _this.get('googleSignupCommsLogOptIn') ? 'true' : 'false'
        }
      }).then(function(res) {
        if(_this.isDestroyed || _this.isDestroying) { return; }
        _this.set('googleSignupBusy', false);
        if(res.token) {
          try {
            sessionStorage.setItem('ll_pending_beta_welcome', '1');
          } catch (e) { /* sessionStorage unavailable */ }
          _this.session.confirm_authentication(res.token).then(function() {
            _this.appState.return_to_index();
          }, function() {
            _this.set('googleSignupError', true);
          });
        }
      }, function(xhr) {
        if(_this.isDestroyed || _this.isDestroying) { return; }
        _this.set('googleSignupBusy', false);
        _this.set('googleSignupError', true);
      });
    }
  }
});
