import Route from '@ember/routing/route';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import app_state from '../utils/app_state';

export default Route.extend({
  controllerName: 'redeem',
  model: function(params) {
    var obj = this.store.findRecord('gift', params.code);
    return obj.then(function(data) {
      if(data && data.get('active')) {
        return RSVP.resolve(data);
      } else {
        return RSVP.resolve(EmberObject.create({invalid: true, code: params.code}));
      }
    }, function() {
      return RSVP.resolve(EmberObject.create({invalid: true, code: params.code}));
    });
  },
  setupController: function(controller, model) {
    var _this = this;
    if(!app_state.get('domain_settings.full_domain')) {
      controller.transitionToRoute('index');
      return;
    }

    controller.set('model', model);
  }
});
