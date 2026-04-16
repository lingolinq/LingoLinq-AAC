import Route from '@ember/routing/route';
import i18n from '../../utils/i18n';

export default Route.extend({
  model: function() {
    var user = this.modelFor('user');
    user.set('subroute_name', i18n.t('trainings', "Trainings"));
    return user;
  },
  setupController: function(controller, model) {
    controller.set('model', model);
    controller.load_lessons();
  }
});
