import Route from '@ember/routing/route';
import LingoLinq from '../app';
import progress_tracker from '../utils/progress_tracker';
import { inject as service } from '@ember/service';

export default Route.extend({
  router: service(),
  store: service('store'),
  persistence: service('persistence'),
  appState: service('app-state'),
  session: service('session'),
  model: function(params) {
    var res = this.store.createRecord('user', {preferences: {}, referrer: LingoLinq.referrer, ad_referrer: LingoLinq.ad_referrer});
    res.set('watch_user_name_and_cookies', true);
    res.set('reg_params', params);
    return res;
  },
  setupController: function(controller, model) {
    controller.set('model', model);
    controller.set('user', model);
    controller.set('coppaWaitingParent', false);
    controller.set('registrationStep', 'role');
    controller.set('registration_role', '');
    controller.set('birth_month', '');
    controller.set('birth_year', '');
    controller.set('registration_country', '');
    controller.set('productImprovementOptIn', false);
    controller.set('coppa_age_group', null);
    controller.set('parent_consent_email', '');
    if(model.get('reg_params.code') && model.get('reg_params.v')) {
      controller.start_code_lookup();
    }
    if(!model.get('preferences')) {
      model.set('preferences', {});
    }
    if(!model.get('preferences.locale')) {
      model.set('preferences.locale', 'en');
    }
    if(controller.get('google_signup')) {
      controller.loadGoogleSignup();
    }
    if(!this.appState.get('domain_settings.full_domain')) {
      this.appState.return_to_index();
      return;
    }
  },
  actions: {
    saveProfile: function() {
      // TODO: add a "save pending..." status somewhere
      var controller = this.get('controller');
      var user = controller.get('model');
      var _this = this;
      controller.set('triedToSave', true);
      if(!user.get('terms_agree')) { return; }
      if(!_this.persistence.get('online')) { return; }
      if(controller.get('badEmail') || controller.get('passwordMismatch') || controller.get('shortPassword') || controller.get('userNameMissing') || controller.get('noSpacesName') || controller.get('userNameUnavailable') || controller.get('coppaBlocksSave') || controller.get('roleIncomplete') || controller.get('countryMissing')) {
        return;
      }
      var country = (controller.get('registration_country') || '').trim().toUpperCase();
      user.set('country', country || null);
      var bm = parseInt(controller.get('birth_month'), 10);
      var by = parseInt(controller.get('birth_year'), 10);
      if(bm >= 1 && bm <= 12) { user.set('birth_month', bm); }
      if(by >= 1900) { user.set('birth_year', by); }
      // Compliance Kernel: jurisdiction declaration is flag-gated. Birth is
      // always sent so the server can enforce COPPA-13.
      if(controller.get('appState.feature_flags.compliance_workflow_kernel')) {
        user.set('jurisdiction_declaration', country || null);
      }
      user.set('under_16', !!controller._classifyUnder16());
      if(controller.get('coppa_age_group') === 'under_13') {
        user.set('coppa_under_13', true);
        user.set('parent_consent_email', (controller.get('parent_consent_email') || '').trim());
      } else {
        user.set('coppa_under_13', false);
        user.set('parent_consent_email', null);
      }
      controller.set('registering', {saving: true});
      // EU under-16: never opt into product-improvement / telemetry at signup.
      var productImprovementOptIn = !!controller.get('productImprovementOptIn') && !controller.get('euUnder16Registration');
      user.set('preferences.cookies', productImprovementOptIn);
      user.set('preferences.telemetry_opt_in', productImprovementOptIn);
      user.set('preferences.comms_log_opt_in', productImprovementOptIn);
      user.save().then(function(user) {
        controller.set('start_code', null);
        user.set('password', null);
        controller.set('triedToSave', false);
        var meta = _this.persistence.meta('user', null);
        var coppaPending = (meta && meta.coppa_parental_consent_pending) || user.get('coppa_parental_consent_pending');
        if(coppaPending) {
          controller.set('registering', null);
          controller.set('coppaWaitingParent', true);
          return;
        }
        var save_done = function() {
          controller.set('registering', null);
          var prefs = user.get('preferences') || {};
          // Default true for new registration when the API omits the key.
          var hasBetaAccess = prefs.beta_program_access !== false;
          // session.override() hard-reloads to `/`, so route transitions here
          // never run. Persist intent in sessionStorage and resume on boot
          // (see index.js afterModel). Home tour runs only after beta welcome.
          try {
            if (hasBetaAccess) {
              sessionStorage.setItem('ll_pending_beta_welcome', '1');
            } else {
              sessionStorage.setItem('ll_auto_open_home_tour', '1');
            }
          } catch (e) { /* private mode / disabled */ }
          if (!hasBetaAccess) {
            _this.appState.set('auto_open_home_tour', true);
          }
          if(meta && meta.access_token) {
            _this.get('session').override(meta);
          } else if(hasBetaAccess) {
            _this.router.transitionTo('beta-welcome-message');
          } else {
            _this.appState.return_to_index();
          }
        };
        if(user.get('start_progress')) {
          controller.set('registering', {saving: true, initializing: true})

          progress_tracker.track(user.get('start_progress'), function(event) {
            if(event.status == 'errored' || (event.status == 'finished' && event.result && event.result.translated === false)) {
              controller.set('registering', {error: {progress: true}});
            } else if(event.status == 'finished') {
              save_done();
            }
          });
        } else {
          save_done();
        }
      }, function(err) {
        controller.set('registering', {error: true});
        if(err.errors && err.errors[0] == 'blocked email address') {
          controller.set('registering', {error: {email_blocked: true}});
        } else if(err.errors && err.errors[0] && err.errors[0].start_code_error) {
          controller.set('registering', {error: {start_code: true}});
        }
      });
    }
  }
});
