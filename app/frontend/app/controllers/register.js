import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import LingoLinq from '../app';
import { computed, observer } from '@ember/object';
import persistence from '../utils/persistence';
import capabilities from '../utils/capabilities';
import i18n from '../utils/i18n';

// TODO: Maybe a pretty img they can send/embed to share with users

// Signup parental-consent age for account activation (COPPA). Always 13 —
// not jurisdiction Art. 8 age 16. EU under-16 use Preferences AI parental
// consent after the account exists (settings['eu_ai_parental_consent']).
var SIGNUP_COPPA_CONSENT_AGE = 13;

// EU-27 alpha-2 — must match LingoLinq::Jurisdiction::EU_COUNTRY_CODES.
var EU_COUNTRY_CODES = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
  'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'
];

export default Controller.extend({
  stashes: service('stashes'),
  persistence: service('persistence'),
  appState: service('app-state'),
  session: service('session'),
  router: service('router'),
  title: "Register",
  queryParams: ['code', 'v', 'google_signup'],
  registrationStep: 'role',
  birth_month: '',
  birth_year: '',
  registration_country: '',
  productImprovementOptIn: false,
  googleSignupProfile: null,
  googleSignupBusy: false,
  googleSignupError: null,
  googleSignupUserName: '',
  googleSignupRegistrationType: 'communicator',
  googleSignupTerms: false,
  googleSignupMissingLinkTerms: false,
  googleSignupProductImprovementOptIn: false,
  // After Google OAuth redirect, driven by server link payload (country/under_16).
  googleSignupShowProductImprovement: true,
  showGoogleSignup: computed('google_signup', 'googleSignupProfile', function() {
    return !!(this.get('google_signup') && this.get('googleSignupProfile'));
  }),
  // EU country + under 16 → hide product-improvement opt-in.
  // Applies to communicator and supporter; the server stamps eu_under_16
  // from country + the under_16 flag, not from registration_type.
  euUnder16Registration: computed(
    'registration_country',
    'birth_month',
    'birth_year',
    function() {
      var country = (this.get('registration_country') || '').toUpperCase();
      if(EU_COUNTRY_CODES.indexOf(country) === -1) { return false; }
      return !!this._classifyUnder16();
    }
  ),
  showProductImprovementOptIn: computed('euUnder16Registration', function() {
    return !this.get('euUnder16Registration');
  }),
  googleSignupUserNameMissing: computed('googleSignupUserName', function() {
    return (this.get('googleSignupUserName') || '').trim().length === 0;
  }),
  googleSignupUserNameInvalid: computed('googleSignupUserName', function() {
    return !!(this.get('googleSignupUserName') || '').match(/[\s\.'"]/);
  }),
  googleSignupSubmitDisabled: computed('googleSignupBusy', 'googleSignupMissingLinkTerms', 'googleSignupTerms', 'googleSignupUserNameMissing', 'googleSignupUserNameInvalid', 'showCoppaConsent', 'age_attested', function() {
    if(this.get('googleSignupBusy')) { return true; }
    if(this.get('googleSignupMissingLinkTerms')) { return true; }
    if(!this.get('googleSignupTerms')) { return true; }
    if(this.get('googleSignupUserNameMissing')) { return true; }
    if(this.get('googleSignupUserNameInvalid')) { return true; }
    if(!this.get('showCoppaConsent') && !this.get('age_attested')) { return true; }
    return false;
  }),
  registration_types: LingoLinq.registrationTypes,
  // Two-tier role: top-level cards (communicator/supporter) + supporter
  // sub-type radios. `registration_role` is UI-only; the persisted value is
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
  showEmailStep: computed('registrationStep', function() {
    return this.get('registrationStep') === 'email';
  }),
  showSupporterTypeStep: computed('registrationStep', function() {
    return this.get('registrationStep') === 'supporter_type';
  }),
  birthDateComplete: computed('birth_month', 'birth_year', function() {
    return !!(this.get('birth_month') && this.get('birth_year'));
  }),
  communicatorAgeRequired: computed('triedToSave', 'birthDateComplete', 'registrationStep', function() {
    var step = this.get('registrationStep');
    if(!this.get('triedToSave') || this.get('birthDateComplete')) { return false; }
    return step === 'communicator_age' || step === 'supporter_type';
  }),
  // Live label on communicator/supporter continue. Incomplete or 13+ stays
  // "Create your account"; only a complete under-13 DOB switches copy.
  showsParentApprovalContinue: computed('birth_month', 'birth_year', function() {
    return this._classifyCommunicatorAge() === 'under_13';
  }),
  localeList: computed(function() {
    var list = i18n.get('locales');
    var res = [{name: i18n.t('english_default', "English (default)"), id: 'en'}];
    for(var key in list) {
      if(!key.match(/-|_/)) {
        var str = i18n.locales[key] || key;
        res.push({name: str, id: key});
      }
    }
    return res;
  }),
  under13BackStep: computed('registration_role', function() {
    return this.get('registration_role') === 'supporter' ? 'supporter_type' : 'communicator_age';
  }),
  countryOptions: computed(function() {
    return [
      {id: 'US', name: i18n.t('country_us', "United States")},
      {id: 'GB', name: i18n.t('country_gb', "United Kingdom")},
      {id: 'CA', name: i18n.t('country_ca', "Canada")},
      {id: 'AU', name: i18n.t('country_au', "Australia")},
      {id: 'NZ', name: i18n.t('country_nz', "New Zealand")},
      {id: 'AT', name: i18n.t('country_at', "Austria")},
      {id: 'BE', name: i18n.t('country_be', "Belgium")},
      {id: 'BG', name: i18n.t('country_bg', "Bulgaria")},
      {id: 'HR', name: i18n.t('country_hr', "Croatia")},
      {id: 'CY', name: i18n.t('country_cy', "Cyprus")},
      {id: 'CZ', name: i18n.t('country_cz', "Czechia")},
      {id: 'DK', name: i18n.t('country_dk', "Denmark")},
      {id: 'EE', name: i18n.t('country_ee', "Estonia")},
      {id: 'FI', name: i18n.t('country_fi', "Finland")},
      {id: 'FR', name: i18n.t('country_fr', "France")},
      {id: 'DE', name: i18n.t('country_de', "Germany")},
      {id: 'GR', name: i18n.t('country_gr', "Greece")},
      {id: 'HU', name: i18n.t('country_hu', "Hungary")},
      {id: 'IE', name: i18n.t('country_ie', "Ireland")},
      {id: 'IT', name: i18n.t('country_it', "Italy")},
      {id: 'LV', name: i18n.t('country_lv', "Latvia")},
      {id: 'LT', name: i18n.t('country_lt', "Lithuania")},
      {id: 'LU', name: i18n.t('country_lu', "Luxembourg")},
      {id: 'MT', name: i18n.t('country_mt', "Malta")},
      {id: 'NL', name: i18n.t('country_nl', "Netherlands")},
      {id: 'PL', name: i18n.t('country_pl', "Poland")},
      {id: 'PT', name: i18n.t('country_pt', "Portugal")},
      {id: 'RO', name: i18n.t('country_ro', "Romania")},
      {id: 'SK', name: i18n.t('country_sk', "Slovakia")},
      {id: 'SI', name: i18n.t('country_si', "Slovenia")},
      {id: 'ES', name: i18n.t('country_es', "Spain")},
      {id: 'SE', name: i18n.t('country_se', "Sweden")},
      {id: 'CH', name: i18n.t('country_ch', "Switzerland")},
      {id: 'JP', name: i18n.t('country_jp', "Japan")},
      {id: 'MX', name: i18n.t('country_mx', "Mexico")},
      {id: 'BR', name: i18n.t('country_br', "Brazil")},
      {id: 'IN', name: i18n.t('country_in', "India")},
      {id: 'ZA', name: i18n.t('country_za', "South Africa")},
      {id: 'SG', name: i18n.t('country_sg', "Singapore")},
      {id: 'KR', name: i18n.t('country_kr', "South Korea")},
      {id: 'XX', name: i18n.t('country_other', "Other")}
    ];
  }),
  countryMissing: computed('triedToSave', 'registration_country', 'registrationStep', function() {
    if(!this.get('triedToSave')) { return false; }
    if(this.get('registrationStep') === 'role') { return false; }
    return !(this.get('registration_country') || '').trim();
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
  supporterTypeRequired: computed('triedToSave', 'registrationStep', 'roleIncomplete', function() {
    return this.get('triedToSave') && this.get('registrationStep') === 'supporter_type' && this.get('roleIncomplete');
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
  // Account-activation parental consent age (COPPA under-13 only).
  // Deliberately NOT raised to 16 for EU countries — GDPR Art. 8 for optional
  // AI enablement is handled post-signup via eu_ai_parental_consent, not by
  // blocking account creation. Domain_settings.coppa_consent_age / eu_consent_age
  // must not drive this signup gate.
  coppaConsentAge: computed(function() {
    return SIGNUP_COPPA_CONSENT_AGE;
  }),
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
  // The Google button lives on the method-chooser (`account`) step. The
  // username is collected AFTER Google returns (in the Google modal), so we no
  // longer gate this on the username — only on the age/terms attestation.
  googleRegisterAllowed: computed('model.terms_agree', 'googleSsoEnabled', 'registrationStep', 'coppa_age_group', 'roleIncomplete', 'persistence.online', function() {
    if(!this.get('googleSsoEnabled')) { return false; }
    if(!this.persistence.get('online')) { return false; }
    if(!this.get('model.terms_agree')) { return false; }
    if(this.get('registrationStep') !== 'account') { return false; }
    if(this.get('coppa_age_group') === 'under_13') { return false; }
    if(this.get('roleIncomplete')) { return false; }
    return true;
  }),
  googleRegisterDisabled: computed('googleRegisterAllowed', function() {
    return !this.get('googleRegisterAllowed');
  }),
  // Still used by the under-13 COPPA step, whose Sign Up relies on
  // saveProfile-side validation for email/password.
  accountStepEmailSignupDisabled: computed('registering.saving', 'model.terms_agree', 'userNameBlank', 'noSpacesName', 'userNameUnavailable', function() {
    return !!(this.get('registering.saving') || !this.get('model.terms_agree') || this.get('userNameBlank') || this.get('noSpacesName') || this.get('userNameUnavailable'));
  }),
  // "Sign up with Email" button on the method-chooser step: only the age/terms
  // attestation gates whether the user can proceed to the email form.
  emailMethodDisabled: computed('model.terms_agree', function() {
    return !this.get('model.terms_agree');
  }),
  // "Sign Up" on the dedicated email step. Terms are already attested on the
  // method-chooser step, so here we additionally require a filled-in username,
  // email, and password before enabling submit.
  emailStepSignupDisabled: computed('registering.saving', 'model.terms_agree', 'userNameBlank', 'noSpacesName', 'userNameUnavailable', 'model.email', 'model.password', function() {
    if(this.get('registering.saving')) { return true; }
    if(!this.get('model.terms_agree')) { return true; }
    if(this.get('userNameBlank') || this.get('noSpacesName') || this.get('userNameUnavailable')) { return true; }
    if(!(this.get('model.email') || '').trim()) { return true; }
    if((this.get('model.password') || '').length < 6) { return true; }
    return false;
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
    this.set('googleSignupMissingLinkTerms', false);
    this.persistence.ajax('/auth/google/signup?nonce=' + encodeURIComponent(nonce), { type: 'GET' }).then(function(res) {
      if(_this.isDestroyed || _this.isDestroying) { return; }
      _this.set('googleSignupProfile', res);
      _this.set('googleSignupBusy', false);
      _this.set('googleSignupRegistrationType', res.registration_type || 'communicator');
      var linkTermsAgreed = !!res.terms_agree;
      _this.set('googleSignupMissingLinkTerms', !linkTermsAgreed);
      _this.set('googleSignupTerms', linkTermsAgreed);
      // The age/terms attestation was made on the method-chooser step before
      // the OAuth redirect (which resets in-memory controller state). Carry it
      // forward from the round-tripped terms_agree so the Google modal doesn't
      // have to re-ask, and Create Account enables once a username is entered.
      // When the link omitted terms, the safety-net checkbox cannot satisfy the
      // server — googleSignupMissingLinkTerms blocks submit and shows restart UI.
      _this.set('age_attested', linkTermsAgreed);
      var showPi = res.show_product_improvement_opt_in !== false;
      _this.set('googleSignupShowProductImprovement', showPi);
      _this.set('googleSignupProductImprovementOptIn', showPi ? !!res.product_improvement_opt_in : false);
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
    // Literal COPPA under-13 for account-activation parent email
    // (coppa_under_13). EU under-16 is classified separately via _classifyUnder16.
    var cutoffYear = today.getFullYear() - this.get('coppaConsentAge');
    var cutoffMonth = today.getMonth() + 1;
    // With month/year only, treat the cutoff month as under the threshold until
    // the exact birthday is known. This keeps Google off the ambiguous edge.
    if(year > cutoffYear || (year === cutoffYear && month >= cutoffMonth)) {
      return 'under_13';
    }
    return 'over_13';
  },
  // Fixed age-16 cutoff for the under_16 registration flag (EU AI prefer-gate).
  // Server sets eu_under_16 from country + this flag. Does NOT trigger signup
  // parent email. Same month/year ambiguity rule as _classifyCommunicatorAge.
  _classifyUnder16: function() {
    var month = parseInt(this.get('birth_month'), 10);
    var year = parseInt(this.get('birth_year'), 10);
    if(!month || !year) { return null; }
    var today = new Date();
    var cutoffYear = today.getFullYear() - 16;
    var cutoffMonth = today.getMonth() + 1;
    if(year > cutoffYear || (year === cutoffYear && month >= cutoffMonth)) {
      return true;
    }
    return false;
  },
  _setProductImprovementPrefs: function(value) {
    var enabled = !!value;
    // Signup model is the user record (route createRecord); do not require a
    // separate controller.user — EU under-16 auto-opt-out runs before that
    // alias exists and Ember set() errors if the preferences path is missing.
    if(!this.get('model.preferences')) {
      this.set('model.preferences', {});
    }
    this.set('model.preferences.cookies', enabled);
    this.set('model.preferences.telemetry_opt_in', enabled);
    this.set('model.preferences.comms_log_opt_in', enabled);
    if(this.get('user.preferences')) {
      this.set('user.preferences.cookies', enabled);
    }
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
        // via the radios.
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
    },
    continue_supporter_type: function() {
      this.set('triedToSave', true);
      if(!(this.get('registration_country') || '').trim()) { return; }
      var ageGroup = this._classifyCommunicatorAge();
      if(!ageGroup) { return; }
      if(['therapist', 'parent', 'teacher', 'other'].indexOf(this.get('model.preferences.registration_type')) === -1) { return; }
      this.set('triedToSave', false);
      this.set('coppa_age_group', ageGroup);
      if(this.get('euUnder16Registration')) {
        this.set('productImprovementOptIn', false);
        this._setProductImprovementPrefs(false);
      }
      this.set('registrationStep', ageGroup === 'under_13' ? 'under_13' : 'account');
    },
    continue_communicator_age: function() {
      this.set('triedToSave', true);
      if(!(this.get('registration_country') || '').trim()) { return; }
      var ageGroup = this._classifyCommunicatorAge();
      if(!ageGroup) { return; }
      this.set('coppa_age_group', ageGroup);
      this.set('triedToSave', false);
      if(this.get('euUnder16Registration')) {
        this.set('productImprovementOptIn', false);
        this._setProductImprovementPrefs(false);
      }
      this.set('registrationStep', ageGroup === 'under_13' ? 'under_13' : 'account');
    },
    toggle_product_improvement: function(value) {
      if(this.get('euUnder16Registration')) {
        this.set('productImprovementOptIn', false);
        this._setProductImprovementPrefs(false);
        return;
      }
      this.set('productImprovementOptIn', !!value);
      this._setProductImprovementPrefs(value);
    },
    allow_start_code: function() {
      this.set('start_code', !this.get('start_code'));
    },
    continue_with_email: function() {
      // Only proceed once the age/terms attestation is made on the method
      // chooser; the attestation is carried forward (same controller, no
      // reload) so the email step never re-asks for it.
      if(!this.get('model.terms_agree')) { return; }
      this.set('triedToSave', false);
      this.set('registrationStep', 'email');
    },
    restart_google_signup: function() {
      this.set('googleSignupProfile', null);
      this.set('googleSignupMissingLinkTerms', false);
      this.set('googleSignupBusy', false);
      this.set('googleSignupError', null);
      this.set('googleSignupTerms', false);
      this.set('googleSignupUserName', '');
      this.set('age_attested', false);
      this.set('googleSignupProductImprovementOptIn', false);
      this.set('googleSignupShowProductImprovement', true);
      this.set('registrationStep', 'account');
      this.router.transitionTo('register', { queryParams: { google_signup: null } });
    },
    continue_with_google: function() {
      if(!this.get('googleRegisterAllowed') || !this.persistence.get('online')) { return; }
      var euUnder16 = !!this.get('euUnder16Registration');
      var optIn = euUnder16 ? false : !!this.get('productImprovementOptIn');
      var under16 = !!this._classifyUnder16();
      var url = '/auth/google/start?flow=register&device_id=' + encodeURIComponent(capabilities.device_id());
      url = url + '&return_origin=' + encodeURIComponent(window.location.origin);
      url = url + '&registration_type=' + encodeURIComponent(this.get('model.preferences.registration_type') || 'communicator');
      url = url + '&user_name=' + encodeURIComponent((this.get('model.user_name') || '').trim());
      url = url + '&terms_agree=' + encodeURIComponent(this.get('model.terms_agree') ? 'true' : 'false');
      url = url + '&product_improvement_opt_in=' + encodeURIComponent(optIn ? 'true' : 'false');
      url = url + '&country=' + encodeURIComponent((this.get('registration_country') || '').trim().toUpperCase());
      url = url + '&under_16=' + encodeURIComponent(under16 ? 'true' : 'false');
      url = url + '&birth_month=' + encodeURIComponent(this.get('birth_month') || '');
      url = url + '&birth_year=' + encodeURIComponent(this.get('birth_year') || '');
      url = url + '&locale=' + encodeURIComponent((this.get('model.preferences.locale') || 'en').trim());
      try {
        sessionStorage.setItem('ll_signup_name', (this.get('model.name') || '').trim());
      } catch (e) { /* sessionStorage unavailable */ }
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
      var optIn = _this.get('googleSignupShowProductImprovement') && _this.get('googleSignupProductImprovementOptIn');
      _this.persistence.ajax('/auth/google/signup', {
        type: 'POST',
        data: {
          nonce: _this.get('google_signup'),
          user_name: (_this.get('googleSignupUserName') || '').trim(),
          registration_type: _this.get('googleSignupRegistrationType') || 'communicator',
          terms_agree: _this.get('googleSignupTerms') ? 'true' : 'false',
          product_improvement_opt_in: optIn ? 'true' : 'false',
          signup_name: (function() {
            try { return sessionStorage.getItem('ll_signup_name') || ''; }
            catch (e) { return ''; }
          })()
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
        var err = xhr && xhr.responseJSON && xhr.responseJSON.error;
        if(err === 'terms_required') {
          _this.set('googleSignupMissingLinkTerms', true);
        } else {
          _this.set('googleSignupError', true);
        }
      });
    }
  }
});
