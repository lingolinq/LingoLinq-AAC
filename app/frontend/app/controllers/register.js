import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import LingoLinq from '../app';
import { computed, observer } from '@ember/object';
import persistence from '../utils/persistence';
import capabilities from '../utils/capabilities';
import i18n from '../utils/i18n';

// TODO: Maybe a pretty img they can send/embed to share with users

export default Controller.extend({
  stashes: service('stashes'),
  persistence: service('persistence'),
  appState: service('app-state'),
  session: service('session'),
  title: "Register",
  queryParams: ['code', 'v', 'google_signup'],
  registrationStep: 'role',
  birth_month: '',
  birth_year: '',
  productImprovementOptIn: false,
  googleSignupProfile: null,
  googleSignupBusy: false,
  googleSignupError: null,
  googleSignupUserName: '',
  googleSignupRegistrationType: 'communicator',
  googleSignupTerms: false,
  googleSignupProductImprovementOptIn: false,
  showGoogleSignup: computed('google_signup', 'googleSignupProfile', function() {
    return !!(this.get('google_signup') && this.get('googleSignupProfile'));
  }),
  googleSignupUserNameMissing: computed('googleSignupUserName', function() {
    return (this.get('googleSignupUserName') || '').trim().length === 0;
  }),
  googleSignupUserNameInvalid: computed('googleSignupUserName', function() {
    return !!(this.get('googleSignupUserName') || '').match(/[\s\.'"]/);
  }),
  googleSignupSubmitDisabled: computed('googleSignupBusy', 'googleSignupTerms', 'googleSignupUserNameMissing', 'googleSignupUserNameInvalid', 'showCoppaConsent', 'age_attested', function() {
    if(this.get('googleSignupBusy')) { return true; }
    if(!this.get('googleSignupTerms')) { return true; }
    if(this.get('googleSignupUserNameMissing')) { return true; }
    if(this.get('googleSignupUserNameInvalid')) { return true; }
    if(!this.get('showCoppaConsent') && !this.get('age_attested')) { return true; }
    return false;
  }),
  registration_types: LingoLinq.registrationTypes,
  // Two-tier role: top-level dropdown (communicator/supporter) + supporter
  // sub-type buttons. `registration_role` is UI-only; the persisted value is
  // always model.preferences.registration_type (communicator or a supporter
  // sub-type), set by the actions below.
  role_categories: LingoLinq.roleCategories,
  supporter_types: LingoLinq.supporterTypes,
  registration_role: '',
  birthMonths: [
    {name: i18n.t('birth_month_placeholder', "Month"), id: ''},
    {name: i18n.t('month_january', "January"), id: '1'},
    {name: i18n.t('month_february', "February"), id: '2'},
    {name: i18n.t('month_march', "March"), id: '3'},
    {name: i18n.t('month_april', "April"), id: '4'},
    {name: i18n.t('month_may', "May"), id: '5'},
    {name: i18n.t('month_june', "June"), id: '6'},
    {name: i18n.t('month_july', "July"), id: '7'},
    {name: i18n.t('month_august', "August"), id: '8'},
    {name: i18n.t('month_september', "September"), id: '9'},
    {name: i18n.t('month_october', "October"), id: '10'},
    {name: i18n.t('month_november', "November"), id: '11'},
    {name: i18n.t('month_december', "December"), id: '12'}
  ],
  birthYears: computed(function() {
    var currentYear = (new Date()).getFullYear();
    var years = [{name: i18n.t('birth_year_placeholder', "Year"), id: ''}];
    for(var year = currentYear; year >= currentYear - 120; year--) {
      years.push({name: year.toString(), id: year.toString()});
    }
    return years;
  }),
  showRoleStep: computed('registrationStep', function() {
    return this.get('registrationStep') === 'role';
  }),
  showCommunicatorAgeStep: computed('registrationStep', function() {
    return this.get('registrationStep') === 'communicator_age';
  }),
  showUnder13Step: computed('registrationStep', function() {
    return this.get('registrationStep') === 'under_13';
  }),
  showAccountStep: computed('registrationStep', function() {
    return this.get('registrationStep') === 'account';
  }),
  showSupporterTypeStep: computed('registrationStep', function() {
    return this.get('registrationStep') === 'supporter_type';
  }),
  birthDateComplete: computed('birth_month', 'birth_year', function() {
    return !!(this.get('birth_month') && this.get('birth_year'));
  }),
  communicatorAgeRequired: computed('triedToSave', 'birthDateComplete', 'registrationStep', function() {
    return this.get('triedToSave') && this.get('registrationStep') === 'communicator_age' && !this.get('birthDateComplete');
  }),
  roleIncomplete: computed('triedToSave', 'registration_role', 'model.preferences.registration_type', function() {
    if(!this.get('triedToSave')) { return false; }
    var role = this.get('registration_role');
    if(!role) { return true; }
    if(role === 'supporter') {
      return ['therapist', 'parent', 'teacher', 'other'].indexOf(this.get('model.preferences.registration_type')) === -1;
    }
    return false;
  }),
  selectedRoleSignupHeading: computed('model.preferences.registration_type', function() {
    switch(this.get('model.preferences.registration_type')) {
      case 'parent':
        return i18n.t('register_signup_as_parent_today', "Sign up as a parent today!");
      case 'teacher':
        return i18n.t('register_signup_as_teacher_today', "Sign up as a teacher today!");
      case 'therapist':
        return i18n.t('register_signup_as_therapist_today', "Sign up as a therapist today!");
      case 'other':
        return i18n.t('register_signup_as_other_supporter_today', "Sign up as another supporter today!");
      case 'communicator':
      default:
        return i18n.t('register_signup_as_communicator_today', "Sign up as a communicator today!");
    }
  }),
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
  noSpacesName: computed('model.user_name', function() {
    return !!(this.get('model.user_name') || '').match(/[\s\.'"]/);
  }),
  userNameBlank: computed('model.user_name', function() {
    return (this.get('model.user_name') || '').trim().length === 0;
  }),
  userNameMissing: computed('triedToSave', 'userNameBlank', function() {
    return this.get('triedToSave') && this.get('userNameBlank');
  }),
  userNameUnavailable: computed('user.user_name_check.exists', function() {
    return !!this.get('user.user_name_check.exists');
  }),
  showCoppaConsent: computed('appState.domain_settings', function() {
    var ds = this.get('appState.domain_settings');
    return !!(ds && ds.coppa_parental_consent);
  }),
  coppa_age_group: null,
  parent_consent_email: '',
  coppaParentEmailMissing: computed('triedToSave', 'coppa_age_group', 'parent_consent_email', function() {
    if(this.get('coppa_age_group') !== 'under_13') { return false; }
    return this.get('triedToSave') && !(this.get('parent_consent_email') || '').trim();
  }),
  coppaParentEmailSameAsAccount: computed('triedToSave', 'coppa_age_group', 'parent_consent_email', 'model.email', function() {
    if(this.get('coppa_age_group') !== 'under_13') { return false; }
    if(!this.get('triedToSave')) { return false; }
    var pe = (this.get('parent_consent_email') || '').trim().toLowerCase();
    var ce = (this.get('model.email') || '').trim().toLowerCase();
    return !!(pe && ce && pe === ce);
  }),
  coppaBlocksSave: computed('triedToSave', 'coppa_age_group', 'parent_consent_email', 'model.email', function() {
    if(!this.get('triedToSave')) { return false; }
    if(this.get('coppa_age_group') !== 'under_13') { return false; }
    var pe = (this.get('parent_consent_email') || '').trim();
    var ce = (this.get('model.email') || '').trim().toLowerCase();
    if(!pe) { return true; }
    if(pe.toLowerCase() === ce) { return true; }
    return false;
  }),
  age_attested: false,
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
  googleSsoEnabled: computed('appState.feature_flags.google_sso', function() {
    return !!this.get('appState.feature_flags.google_sso');
  }),
  googleRegisterAllowed: computed('model.terms_agree', 'googleSsoEnabled', 'registrationStep', 'coppa_age_group', 'roleIncomplete', 'persistence.online', 'userNameBlank', 'noSpacesName', 'userNameUnavailable', function() {
    if(!this.get('googleSsoEnabled')) { return false; }
    if(!this.persistence.get('online')) { return false; }
    if(!this.get('model.terms_agree')) { return false; }
    if(this.get('userNameBlank')) { return false; }
    if(this.get('noSpacesName') || this.get('userNameUnavailable')) { return false; }
    if(this.get('registrationStep') !== 'account') { return false; }
    if(this.get('coppa_age_group') === 'under_13') { return false; }
    if(this.get('roleIncomplete')) { return false; }
    return true;
  }),
  googleRegisterDisabled: computed('googleRegisterAllowed', function() {
    return !this.get('googleRegisterAllowed');
  }),
  accountStepEmailSignupDisabled: computed('registering.saving', 'model.terms_agree', 'userNameBlank', 'noSpacesName', 'userNameUnavailable', function() {
    return !!(this.get('registering.saving') || !this.get('model.terms_agree') || this.get('userNameBlank') || this.get('noSpacesName') || this.get('userNameUnavailable'));
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
      _this.set('googleSignupRegistrationType', res.registration_type || 'communicator');
      _this.set('googleSignupTerms', !!res.terms_agree);
      _this.set('googleSignupProductImprovementOptIn', !!res.product_improvement_opt_in);
      _this.set('googleSignupUserName', res.user_name || '');
      if(res.name && !_this.get('googleSignupUserName')) {
        _this.set('googleSignupUserName', '');
      }
    }, function() {
      if(_this.isDestroyed || _this.isDestroying) { return; }
      _this.set('googleSignupBusy', false);
      _this.set('googleSignupError', true);
    });
  },
  _classifyCommunicatorAge: function() {
    var month = parseInt(this.get('birth_month'), 10);
    var year = parseInt(this.get('birth_year'), 10);
    if(!month || !year) { return null; }
    var today = new Date();
    var cutoffYear = today.getFullYear() - 13;
    var cutoffMonth = today.getMonth() + 1;
    // With month/year only, treat the cutoff month as under 13 until the
    // exact birthday is known. This keeps Google off the ambiguous edge.
    if(year > cutoffYear || (year === cutoffYear && month >= cutoffMonth)) {
      return 'under_13';
    }
    return 'over_13';
  },
  _setProductImprovementPrefs: function(value) {
    var enabled = !!value;
    this.set('user.preferences.cookies', enabled);
    this.set('model.preferences.cookies', enabled);
    this.set('model.preferences.telemetry_opt_in', enabled);
    this.set('model.preferences.comms_log_opt_in', enabled);
  },
  init() {
    this._super(...arguments);
    var self = this;
    this.ctrlAction = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function() {
        var args = bound.concat(Array.prototype.slice.call(arguments));
        var evt = args[args.length - 1];
        if (evt && typeof evt.preventDefault === 'function' && (evt.type || evt.target)) {
          if (evt.preventDefault) { evt.preventDefault(); }
          args.pop();
        }
        self.send.apply(self, [actionName].concat(args));
      };
    };
  },
  actions: {
    go_to_step: function(step) {
      this.set('triedToSave', false);
      this.set('registrationStep', step);
    },
    select_registration_role: function(val) {
      this.set('registration_role', val);
      this.set('triedToSave', false);
      if(val === 'communicator') {
        this.set('model.preferences.registration_type', 'communicator');
        this.set('registrationStep', 'communicator_age');
      } else if(val === 'supporter') {
        // 'supporter' is a UI grouping; the persisted registration_type must be
        // a supporter sub-type (therapist/parent/teacher/other) so the backend
        // maps role=supporter. Clear any non-supporter value to force a choice
        // via the buttons.
        if(['therapist', 'parent', 'teacher', 'other'].indexOf(this.get('model.preferences.registration_type')) === -1) {
          this.set('model.preferences.registration_type', null);
        }
        this.set('coppa_age_group', null);
        this.set('parent_consent_email', '');
        this.set('registrationStep', 'supporter_type');
      } else {
        this.set('model.preferences.registration_type', null);
      }
    },
    select_supporter_type: function(type) {
      this.set('registration_role', 'supporter');
      this.set('model.preferences.registration_type', type);
      this.set('registrationStep', 'account');
    },
    continue_communicator_age: function() {
      this.set('triedToSave', true);
      var ageGroup = this._classifyCommunicatorAge();
      if(!ageGroup) { return; }
      this.set('coppa_age_group', ageGroup);
      this.set('triedToSave', false);
      this.set('registrationStep', ageGroup === 'under_13' ? 'under_13' : 'account');
    },
    toggle_product_improvement: function(value) {
      this.set('productImprovementOptIn', !!value);
      this._setProductImprovementPrefs(value);
    },
    allow_start_code: function() {
      this.set('start_code', !this.get('start_code'));
    },
    continue_with_google: function() {
      if(!this.get('googleRegisterAllowed') || !this.persistence.get('online')) { return; }
      var url = '/auth/google/start?flow=register&device_id=' + encodeURIComponent(capabilities.device_id());
      url = url + '&return_origin=' + encodeURIComponent(window.location.origin);
      url = url + '&registration_type=' + encodeURIComponent(this.get('model.preferences.registration_type') || 'communicator');
      url = url + '&user_name=' + encodeURIComponent((this.get('model.user_name') || '').trim());
      url = url + '&terms_agree=' + encodeURIComponent(this.get('model.terms_agree') ? 'true' : 'false');
      url = url + '&product_improvement_opt_in=' + encodeURIComponent(this.get('productImprovementOptIn') ? 'true' : 'false');
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
          registration_type: _this.get('googleSignupRegistrationType') || 'communicator',
          terms_agree: _this.get('googleSignupTerms') ? 'true' : 'false',
          product_improvement_opt_in: _this.get('googleSignupProductImprovementOptIn') ? 'true' : 'false'
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
