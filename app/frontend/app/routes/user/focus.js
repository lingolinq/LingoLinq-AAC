import Route from '@ember/routing/route';
import i18n from '../../utils/i18n';
import { inject as service } from '@ember/service';

export default Route.extend({
  appState: service('app-state'),
  model: function() {
    var user = this.modelFor('user');
    return user;
  },
  setupController: function(controller, model) {
    controller.set('model', model);
    controller.set('user', this.modelFor('user'));
    controller.set('focus', this.appState.get('focus_route'));
  }
});
