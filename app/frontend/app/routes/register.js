import Route from '@ember/routing/route';
import LingoLinq from '../app';
import progress_tracker from '../utils/progress_tracker';
import { inject as service } from '@ember/service';

export default Route.extend({
  store: service('store'),
  persistence: service('persistence'),
  appState: service('app-state'),
  model: function(params) {
    var res = this.store.createRecord('user', {preferences: {}, referrer: LingoLinq.referrer, ad_referrer: LingoLinq.ad_referrer});
    res.set('watch_user_name_and_cookies', true);
    res.set('reg_params', params);
    return res;
  },
  setupController: function(controller, model) {
    controller.set('model', model);
    controller.set('user', model);
    if(model.get('reg_params.code') && model.get('reg_params.v')) {
      controller.start_code_lookup();
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
      if(controller.get('badEmail') || controller.get('passwordMismatch') || controller.get('shortPassword') || controller.get('noName')|| controller.get('noSpacesName')) {
        return;
      }
      controller.set('registering', {saving: true});
      user.save().then(function(user) {
        controller.set('start_code', null);
        user.set('password', null);
        controller.set('triedToSave', false);
        var meta = _this.persistence.meta('user', null);
        var save_done = function() {
          controller.set('registering', null);
          _this.appState.return_to_index();
          if(meta && meta.access_token) {
            _this.get('session').override(meta);
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
