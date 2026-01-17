import Route from '@ember/routing/route';
import app_state from '../../utils/app_state';
import i18n from '../../utils/i18n';

export default Route.extend({
  model: function() {
    var user = this.modelFor('user');
    return user;
  },
  setupController: function(controller, model) {
    controller.set('model', model);
    controller.set('user', this.modelFor('user'));
    controller.set('focus', app_state.get('focus_route'));
  }
});
