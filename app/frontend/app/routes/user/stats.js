import Route from '@ember/routing/route';
import i18n from '../../utils/i18n';

export default Route.extend({
  model: function() {
    var user = this.modelFor('user');
    user.set('subroute_name', i18n.t('reports', 'reports'));
    return user;
  },
  resetController: function(controller, isExiting) {
    if(isExiting) {
      controller.reset_params();
    }
  },
  setupController: function(controller, model) {
    controller.set('model', model);
    if(model.get('preferences.logging')) {
      controller.load_charts();
      controller.load_core();
    }
    controller.load_snapshots();
  }
});
