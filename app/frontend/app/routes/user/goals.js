import Route from '@ember/routing/route';
import i18n from '../../utils/i18n';

export default Route.extend({
  model: function() {
    var user = this.modelFor('user');
    user.set('subroute_name', i18n.t('goals', "goals"));
    return user;
  },
  setupController: function(controller, model) {
    controller.set('model', model);
    controller.load_goals();
    controller.load_badges();
  }
});
