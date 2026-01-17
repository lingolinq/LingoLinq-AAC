import Route from '@ember/routing/route';
import modal from '../../utils/modal';
import coughDropExtras from '../../utils/extras';
import app_state from '../../utils/app_state';
import i18n from '../../utils/i18n';

export default Route.extend({
  model: function() {
    var model = this.modelFor('user');
    model.set('subroute_name', i18n.t('summary', 'summary'));
    return model;
  },
  setupController: function(controller, model) {
    controller.set('model', model);
    controller.set('extras', coughDropExtras);
    controller.set('parent_object', null);
    controller.set('password', null);
    controller.set('new_user_name', null);
    controller.update_selected();
    controller.reload_logs();
    controller.load_badges();
    controller.load_goals();
  },
  actions: {
    recordNote: function(type) {
      var _this = this;
      var user = this.modelFor('user');
      app_state.check_for_needing_purchase().then(function() {
        modal.open('record-note', {note_type: type, user: user}).then(function() {
          _this.get('controller').reload_logs();
        });
      });
    }
  }
});
