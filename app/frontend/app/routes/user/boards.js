import Route from '@ember/routing/route';
import modal from '../../utils/modal';
import i18n from '../../utils/i18n';
import { inject as service } from '@ember/service';

export default Route.extend({
  appState: service('app-state'),
  controllerName: 'user/index',

  activate: function() {
    this._super(...arguments);
  },

  model: function() {
    var model = this.modelFor('user');
    model.set('subroute_name', i18n.t('boards', 'boards'));
    return model;
  },
  setupController: function(controller, model) {
    if(model) { model.reload(); }
    controller.set('model', model);
    controller.set('parent_object', null);
    controller.set('password', null);
    controller.set('new_user_name', null);
    controller.set('filterString', '');
    controller.set('filterStringDebounced', '');
    controller.update_selected();
    controller.reload_logs();
    controller.load_badges();
    controller.load_goals();
  },
  actions: {
    recordNote: function(type) {
      var _this = this;
      var user = this.modelFor('user');
      this.appState.check_for_needing_purchase().then(function() {
        modal.open('record-note', {note_type: type, user: user}).then(function() {
          _this.get('controller').reload_logs();
        });
      });
    }
  }
});
