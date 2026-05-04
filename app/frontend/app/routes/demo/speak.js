import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';
import demoBoardLoader from '../../utils/demo_board_loader';
import i18n from '../../utils/i18n';

export default Route.extend({
  appState: service('app-state'),

  model: function() {
    return demoBoardLoader.load_root();
  },

  setupController: function(controller, model) {
    this._super(controller, model);
    controller.setup_demo(model);
  },

  activate: function() {
    this._super(...arguments);
    window.scrollTo(0, 0);
    this.set('appState.speak_mode', true);
    var appController = this.controllerFor('application');
    if(appController && appController.updateTitle) {
      appController.updateTitle(i18n.t('demo_speak_mode_title', "Try Speak Mode"));
    }
  },

  resetController: function(controller, isExiting) {
    if(isExiting) {
      controller.reset_demo();
      this.set('appState.speak_mode', false);
    }
  }
});
