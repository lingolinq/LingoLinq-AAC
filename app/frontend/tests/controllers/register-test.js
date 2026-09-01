import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  waitsFor,
  runs,
  stub
} from 'frontend/tests/helpers/jasmine';
import EmberObject from '@ember/object';

describe('RegisterController', 'controller:register', function() {
  var testOwner;

  beforeEach(function() {
    testOwner = this.owner;
  });

  it("should exist", function() {
    expect(this).not.toEqual(null);
    expect(this).not.toEqual(window);
  });

  it("moves communicators through the birthdate step before account details", function() {
    var controller = testOwner.lookup('controller:register');
    controller.set('model', EmberObject.create({ preferences: {} }));
    controller.send('select_registration_role', 'communicator');

    expect(controller.get('registrationStep')).toEqual('communicator_age');
    expect(controller.get('model.preferences.registration_type')).toEqual('communicator');

    controller.set('registration_country', 'US');
    controller.set('birth_month', '1');
    controller.set('birth_year', ((new Date()).getFullYear() - 20).toString());
    controller.send('continue_communicator_age');

    expect(controller.get('coppa_age_group')).toEqual('over_13');
    expect(controller.get('registrationStep')).toEqual('account');
  });

  it("routes under-13 communicators to the parent approval step", function() {
    var controller = testOwner.lookup('controller:register');
    controller.set('model', EmberObject.create({ preferences: {} }));
    controller.send('select_registration_role', 'communicator');
    controller.set('registration_country', 'US');
    controller.set('birth_month', '1');
    controller.set('birth_year', (new Date()).getFullYear().toString());
    controller.send('continue_communicator_age');

    expect(controller.get('coppa_age_group')).toEqual('under_13');
    expect(controller.get('registrationStep')).toEqual('under_13');
    controller.set('triedToSave', true);
    expect(controller.get('coppaParentEmailMissing')).toEqual(true);
  });

  it("does not ask for signup parent email for EU communicators aged 13–15", function() {
    var controller = testOwner.lookup('controller:register');
    controller.set('model', EmberObject.create({ preferences: {} }));
    controller.send('select_registration_role', 'communicator');
    controller.set('registration_country', 'DE');
    controller.set('birth_month', '1');
    // Age 14: under 16 (EU AI flag) but over COPPA under-13 signup gate.
    controller.set('birth_year', ((new Date()).getFullYear() - 14).toString());
    controller.send('continue_communicator_age');

    expect(controller.get('coppaConsentAge')).toEqual(13);
    expect(controller.get('coppa_age_group')).toEqual('over_13');
    expect(controller.get('registrationStep')).toEqual('account');
    expect(controller._classifyUnder16()).toEqual(true);
  });

  it("still routes EU under-13 communicators to the COPPA parent approval step", function() {
    var controller = testOwner.lookup('controller:register');
    controller.set('model', EmberObject.create({ preferences: {} }));
    controller.send('select_registration_role', 'communicator');
    controller.set('registration_country', 'FR');
    controller.set('birth_month', '1');
    controller.set('birth_year', ((new Date()).getFullYear() - 10).toString());
    controller.send('continue_communicator_age');

    expect(controller.get('coppa_age_group')).toEqual('under_13');
    expect(controller.get('registrationStep')).toEqual('under_13');
    expect(controller._classifyUnder16()).toEqual(true);
  });

  it("hides product-improvement opt-in for EU under-16 communicators", function() {
    var controller = testOwner.lookup('controller:register');
    controller.set('model', EmberObject.create({ preferences: {} }));
    controller.send('select_registration_role', 'communicator');
    controller.set('registration_country', 'DE');
    controller.set('birth_month', '1');
    controller.set('birth_year', ((new Date()).getFullYear() - 14).toString());
    controller.set('productImprovementOptIn', true);
    controller.send('continue_communicator_age');

    expect(controller.get('euUnder16Registration')).toEqual(true);
    expect(controller.get('showProductImprovementOptIn')).toEqual(false);
    expect(controller.get('productImprovementOptIn')).toEqual(false);
    expect(controller.get('model.preferences.cookies')).toEqual(false);
    expect(controller.get('model.preferences.telemetry_opt_in')).toEqual(false);
    expect(controller.get('model.preferences.comms_log_opt_in')).toEqual(false);
  });

  it("shows product-improvement opt-in for non-EU under-16 communicators", function() {
    var controller = testOwner.lookup('controller:register');
    controller.set('model', EmberObject.create({ preferences: {} }));
    controller.send('select_registration_role', 'communicator');
    controller.set('registration_country', 'US');
    controller.set('birth_month', '1');
    controller.set('birth_year', ((new Date()).getFullYear() - 14).toString());
    controller.send('continue_communicator_age');

    expect(controller.get('euUnder16Registration')).toEqual(false);
    expect(controller.get('showProductImprovementOptIn')).toEqual(true);
  });

  it("switches the continue label when the birth date is under 13", function() {
    var controller = testOwner.lookup('controller:register');
    controller.set('model', EmberObject.create({ preferences: {} }));
    controller.send('select_registration_role', 'communicator');

    expect(controller.get('showsParentApprovalContinue')).toEqual(false);

    controller.set('birth_month', '1');
    controller.set('birth_year', ((new Date()).getFullYear() - 20).toString());
    expect(controller.get('showsParentApprovalContinue')).toEqual(false);

    controller.set('birth_year', (new Date()).getFullYear().toString());
    expect(controller.get('showsParentApprovalContinue')).toEqual(true);
  });

  it("stores supporter subtypes without persisting the supporter grouping", function() {
    var controller = testOwner.lookup('controller:register');
    controller.set('model', EmberObject.create({ preferences: {} }));
    controller.send('select_registration_role', 'supporter');

    expect(controller.get('registrationStep')).toEqual('supporter_type');
    expect(controller.get('model.preferences.registration_type')).toEqual(null);

    controller.set('registration_country', 'US');
    controller.set('birth_month', '1');
    controller.set('birth_year', ((new Date()).getFullYear() - 30).toString());
    controller.send('select_supporter_type', 'teacher');
    expect(controller.get('registrationStep')).toEqual('supporter_type');
    controller.send('continue_supporter_type');
    expect(controller.get('registrationStep')).toEqual('account');
    expect(controller.get('registration_role')).toEqual('supporter');
    expect(controller.get('model.preferences.registration_type')).toEqual('teacher');
  });

  it("selecting a supporter type does not leave the step", function() {
    var controller = testOwner.lookup('controller:register');
    controller.set('model', EmberObject.create({ preferences: {} }));
    controller.send('select_registration_role', 'supporter');
    controller.set('registration_country', 'US');
    controller.set('birth_month', '1');
    controller.set('birth_year', ((new Date()).getFullYear() - 30).toString());
    controller.send('select_supporter_type', 'teacher');

    expect(controller.get('registrationStep')).toEqual('supporter_type');
    expect(controller.get('model.preferences.registration_type')).toEqual('teacher');
  });

  it("does not leave the supporter type step without a supporter type", function() {
    var controller = testOwner.lookup('controller:register');
    controller.set('model', EmberObject.create({ preferences: {} }));
    controller.send('select_registration_role', 'supporter');
    controller.set('registration_country', 'US');
    controller.set('birth_month', '1');
    controller.set('birth_year', ((new Date()).getFullYear() - 30).toString());
    controller.send('continue_supporter_type');

    expect(controller.get('registrationStep')).toEqual('supporter_type');
    expect(controller.get('supporterTypeRequired')).toEqual(true);
    expect(controller.get('model.preferences.registration_type')).toEqual(null);
  });

  it("does not leave the supporter type step without a birth month and year", function() {
    var controller = testOwner.lookup('controller:register');
    controller.set('model', EmberObject.create({ preferences: {} }));
    controller.send('select_registration_role', 'supporter');
    controller.set('registration_country', 'US');
    controller.send('select_supporter_type', 'teacher');
    controller.send('continue_supporter_type');

    expect(controller.get('registrationStep')).toEqual('supporter_type');
    expect(controller.get('communicatorAgeRequired')).toEqual(true);
    expect(controller.get('model.preferences.registration_type')).toEqual('teacher');
  });

  it("routes under-13 supporters to the parent approval step", function() {
    var controller = testOwner.lookup('controller:register');
    controller.set('model', EmberObject.create({ preferences: {} }));
    controller.send('select_registration_role', 'supporter');
    controller.set('registration_country', 'US');
    controller.set('birth_month', '1');
    controller.set('birth_year', (new Date()).getFullYear().toString());
    controller.send('select_supporter_type', 'parent');
    controller.send('continue_supporter_type');

    expect(controller.get('coppa_age_group')).toEqual('under_13');
    expect(controller.get('registrationStep')).toEqual('under_13');
    expect(controller.get('model.preferences.registration_type')).toEqual('parent');
    controller.set('triedToSave', true);
    expect(controller.get('coppaParentEmailMissing')).toEqual(true);
    expect(controller.get('googleRegisterAllowed')).toEqual(false);
  });

  it("does not ask for signup parent email for EU supporters aged 13–15", function() {
    var controller = testOwner.lookup('controller:register');
    controller.set('model', EmberObject.create({ preferences: {} }));
    controller.send('select_registration_role', 'supporter');
    controller.set('registration_country', 'DE');
    controller.set('birth_month', '1');
    controller.set('birth_year', ((new Date()).getFullYear() - 14).toString());
    controller.send('select_supporter_type', 'teacher');
    controller.send('continue_supporter_type');

    expect(controller.get('coppa_age_group')).toEqual('over_13');
    expect(controller.get('registrationStep')).toEqual('account');
    expect(controller._classifyUnder16()).toEqual(true);
    expect(controller.get('euUnder16Registration')).toEqual(true);
    expect(controller.get('showProductImprovementOptIn')).toEqual(false);
    expect(controller.get('productImprovementOptIn')).toEqual(false);
  });

  it("shows product-improvement opt-in for non-EU under-16 supporters", function() {
    var controller = testOwner.lookup('controller:register');
    controller.set('model', EmberObject.create({ preferences: {} }));
    controller.send('select_registration_role', 'supporter');
    controller.set('registration_country', 'US');
    controller.set('birth_month', '1');
    controller.set('birth_year', ((new Date()).getFullYear() - 14).toString());
    controller.send('select_supporter_type', 'teacher');
    controller.send('continue_supporter_type');

    expect(controller.get('euUnder16Registration')).toEqual(false);
    expect(controller.get('showProductImprovementOptIn')).toEqual(true);
  });

  it("shows role-specific signup heading copy", function() {
    var controller = testOwner.lookup('controller:register');
    controller.set('model', EmberObject.create({ preferences: { registration_type: 'parent' } }));
    expect(controller.get('selectedRoleSignupHeading')).toEqual("Sign up as a parent today!");

    controller.set('model.preferences.registration_type', 'teacher');
    expect(controller.get('selectedRoleSignupHeading')).toEqual("Sign up as a teacher today!");

    controller.set('model.preferences.registration_type', 'other');
    expect(controller.get('selectedRoleSignupHeading')).toEqual("Sign up as another supporter today!");

    controller.set('model.preferences.registration_type', 'communicator');
    expect(controller.get('selectedRoleSignupHeading')).toEqual("Sign up as a communicator today!");
  });

  it("maps the optional product improvement checkbox to existing preferences", function() {
    var prefs = {};
    var controller = testOwner.lookup('controller:register');
    controller.set('model', EmberObject.create({ preferences: prefs }));
    controller.set('user', EmberObject.create({ preferences: prefs }));

    controller.send('toggle_product_improvement', true);
    expect(controller.get('model.preferences.cookies')).toEqual(true);
    expect(controller.get('model.preferences.telemetry_opt_in')).toEqual(true);
    expect(controller.get('model.preferences.comms_log_opt_in')).toEqual(true);

    controller.send('toggle_product_improvement', false);
    expect(controller.get('model.preferences.cookies')).toEqual(false);
    expect(controller.get('model.preferences.telemetry_opt_in')).toEqual(false);
    expect(controller.get('model.preferences.comms_log_opt_in')).toEqual(false);
  });

  it("requires username before Google completion can submit", function() {
    var controller = testOwner.lookup('controller:register');
    controller.set('googleSignupBusy', false);
    controller.set('googleSignupTerms', true);
    controller.set('age_attested', true);
    controller.set('googleSignupUserName', '');

    expect(controller.get('googleSignupSubmitDisabled')).toEqual(true);

    controller.set('googleSignupUserName', 'chosen-name');
    expect(controller.get('googleSignupSubmitDisabled')).toEqual(false);

    controller.set('googleSignupUserName', 'chosen name');
    expect(controller.get('googleSignupSubmitDisabled')).toEqual(true);
  });

  it("blocks Google completion when the OAuth link omitted terms attestation", function() {
    var controller = testOwner.lookup('controller:register');
    controller.set('googleSignupBusy', false);
    controller.set('googleSignupMissingLinkTerms', true);
    controller.set('googleSignupTerms', true);
    controller.set('googleSignupUserName', 'chosen-name');
    controller.set('age_attested', true);

    expect(controller.get('googleSignupSubmitDisabled')).toEqual(true);
  });

  it("requires username on staged email signup steps", function() {
    var controller = testOwner.lookup('controller:register');
    controller.set('model', EmberObject.create({ preferences: {}, terms_agree: true, user_name: '' }));
    controller.set('user', EmberObject.create({ user_name_check: { exists: false } }));
    controller.set('registrationStep', 'account');
    controller.set('triedToSave', true);

    expect(controller.get('userNameMissing')).toEqual(true);
    expect(controller.get('accountStepEmailSignupDisabled')).toEqual(true);

    controller.set('model.user_name', 'chosen-name');
    expect(controller.get('userNameMissing')).toEqual(false);
    expect(controller.get('accountStepEmailSignupDisabled')).toEqual(false);
  });

  it("gates the method-chooser buttons on the age/terms attestation", function() {
    var controller = testOwner.lookup('controller:register');
    controller.set('model', EmberObject.create({ preferences: {}, terms_agree: false }));

    expect(controller.get('emailMethodDisabled')).toEqual(true);

    controller.set('combined_consent', true);
    expect(controller.get('model.terms_agree')).toEqual(true);
    expect(controller.get('age_attested')).toEqual(true);
    expect(controller.get('emailMethodDisabled')).toEqual(false);
  });

  it("advances from the method chooser to the email step only once terms are agreed", function() {
    var controller = testOwner.lookup('controller:register');
    controller.set('model', EmberObject.create({ preferences: {}, terms_agree: false }));
    controller.set('registrationStep', 'account');

    controller.send('continue_with_email');
    expect(controller.get('registrationStep')).toEqual('account');

    controller.set('combined_consent', true);
    controller.send('continue_with_email');
    expect(controller.get('registrationStep')).toEqual('email');
    expect(controller.get('showEmailStep')).toEqual(true);
  });

  it("requires username, email, and password before the email step can submit", function() {
    var controller = testOwner.lookup('controller:register');
    controller.set('model', EmberObject.create({ preferences: {}, terms_agree: true, user_name: 'chosen-name', email: '', password: '' }));
    controller.set('user', EmberObject.create({ user_name_check: { exists: false } }));

    expect(controller.get('emailStepSignupDisabled')).toEqual(true);

    controller.set('model.email', 'person@example.com');
    expect(controller.get('emailStepSignupDisabled')).toEqual(true);

    controller.set('model.password', 'secret6');
    expect(controller.get('emailStepSignupDisabled')).toEqual(false);
  });

  it("posts Google register start so birth month/year is not on a GET query string", function() {
    var controller = testOwner.lookup('controller:register');
    controller.set('model', EmberObject.create({
      preferences: { registration_type: 'communicator', locale: 'en' },
      terms_agree: true,
      user_name: 'chosen-name',
      name: 'Ada'
    }));
    controller.set('registrationStep', 'account');
    controller.set('coppa_age_group', 'over_13');
    controller.set('birth_month', '1');
    controller.set('birth_year', '2000');
    controller.set('registration_country', 'US');
    controller.set('appState', EmberObject.create({ feature_flags: { google_sso: true } }));
    controller.set('persistence', { get: function(key) { return key === 'online'; } });

    var posted = null;
    controller._submitGoogleRegisterStart = function(fields, openBlank) {
      posted = { fields: fields, openBlank: openBlank };
    };
    controller.send('continue_with_google');

    expect(posted).not.toEqual(null);
    expect(posted.fields.flow).toEqual('register');
    expect(posted.fields.birth_month).toEqual('1');
    expect(posted.fields.birth_year).toEqual('2000');
    expect(posted.fields.terms_agree).toEqual('true');
    expect(posted.openBlank).toEqual(false);
  });
});
// import Ember from 'ember';
// 
// export default EmberObjectController.extend({
//   title: "Register",
//   triedToSave: false,
//   badEmail: function() {
//     var email = this.get('email');
//     return (this.get('triedToSave') && !email);
//   }.property('email', 'triedToSave'),
//   passwordMismatch: function() {
//     var present = this.get('password');
//     var matches = !present || this.get('password') == this.get('password2');
//     return (present && !matches) || (this.get('triedToSave') && !matches);
//   }.property('password', 'password2', 'triedToSave'),
//   shortPassword: function() {
//     var password = this.get('password') || '';
//     var password2 = this.get('password2');
//     return (this.get('triedToSave') || password == password2) && password.length < 6;
//   }.property('password', 'password2', 'triedToSave'),
//   noName: function() {
//     var name = this.get('name');
//     var user_name = this.get('user_name');
//     return this.get('triedToSave') && !name && !user_name;
//   }.property('name', 'user_name', 'triedToSave')
// });