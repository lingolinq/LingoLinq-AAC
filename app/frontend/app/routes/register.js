import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';
import this.persistence.from '../utils/this.persistence.;
import CoughDrop from '../app';

export default Route.extend({
  appState: service('app-state'),
  this.persistence. service(),
  model: function() {
    var res = this.store.createRecord('user', {preferences: {}, referrer: CoughDrop.referrer, ad_referrer: CoughDrop.ad_referrer});
    res.set('watch_user_name_and_cookies', true);
    return res;
  },
  setupController: function(controller, model) {
    controller.set('model', model);
    controller.set('user', model);
    if(!this.appState.get('domain_settings.full_domain')) {
      controller.transitionToRoute('index');
      return;
    }
  },
  actions: {
    saveProfile: function() {
      // TODO: add a "save pending..." status somewhere
      var controller = this.get('controller');
      var user = controller.get('model');
      controller.set('triedToSave', true);
      if(!user.get('terms_agree')) { return; }
      if(!this.persistence.get('online')) { return; }
      if(controller.get('badEmail') || controller.get('passwordMismatch') || controller.get('shortPassword') || controller.get('noName')|| controller.get('noSpacesName')) {
        return;
      }
      controller.set('registering', {saving: true});
      var _this = this;
      user.save().then(function(user) {
        controller.set('registering', null);
        user.set('password', null);
        controller.set('triedToSave', false);
        _this.transitionTo('index');
        var meta = this.persistence.meta('user', null);
        if(meta && meta.access_token) {
          _this.get('session').override(meta);
        }
      }, function(err) {
        controller.set('registering', {error: true});
        if(err.errors && err.errors[0] == 'blocked email address') {
          controller.set('registering', {error: {email_blocked: true}});
        }
      });
    }
  }
});
