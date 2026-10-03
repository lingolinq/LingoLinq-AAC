import Route from '@ember/routing/route';
import i18n from '../../utils/i18n';

export default Route.extend({
  model: function() {
    var model = this.modelFor('user');
    model.set('subroute_name', i18n.t('profile', "profile"));
    return model;
  },
  setupController: function(controller, model) {
    controller.set('model', model);
    controller.load_integrations();
    controller.set('contact_name', null);
    controller.set('contact_contact', null);
    controller.set('contact_image_url', null);
  }
});
