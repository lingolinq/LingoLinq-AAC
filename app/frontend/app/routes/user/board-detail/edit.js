import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default Route.extend({
  appState: service('app-state'),
  stashes: service('stashes'),

  model: function() {
    return this.modelFor('user.board-detail');
  },

  setupController: function(controller, model) {
    controller.set('model', model);
    var _this = this;
    var boardDetailController = this.controllerFor('user.board-detail');

    // Check if the user needs to purchase before entering edit mode
    // Uses the appState service's check_for_needing_purchase which returns a promise
    _this.appState.check_for_needing_purchase().then(function() {
      boardDetailController.set('edit_mode', true);
      _this.stashes.persist('current_mode', 'edit');
    }, function() {
      // Purchase required but not completed — stay in view mode
    });
  },

  resetController: function(controller, isExiting) {
    if(isExiting) {
      var boardDetailController = this.controllerFor('user.board-detail');
      boardDetailController.set('edit_mode', false);
      boardDetailController.set('paint_mode', null);
      boardDetailController.set('color_picker_button', null);
      this.stashes.persist('current_mode', 'default');
    }
  }
});
