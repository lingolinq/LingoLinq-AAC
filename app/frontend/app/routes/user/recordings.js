import Route from '@ember/routing/route';
import i18n from '../../utils/i18n';
import contentGrabbers from '../../utils/content_grabbers';

export default Route.extend({
  model: function() {
    var user = this.modelFor('user');
    user.set('subroute_name', i18n.t('recordings', "recordings"));
    return user;
  },
  setupController: function(controller, model) {
    contentGrabbers.soundGrabber.recordings_controller = controller;
    controller.set('model', model);
    controller.load_recordings();
  }
});
