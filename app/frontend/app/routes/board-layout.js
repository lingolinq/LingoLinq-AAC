import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';
import { later as runLater } from '@ember/runloop';
import i18n from '../utils/i18n';
import modal from '../utils/modal';

export default Route.extend({
  appState: service('app-state'),

  model(params) {
    return {
      board_key: params.board_key,
      user: this.get('appState.currentUser')
    };
  },

  afterModel(model) {
    if (!model.user) {
      this.transitionTo('index');
    }
  },

  setupController(controller, model) {
    this._super(controller, model);
    // Close any modals that may have been triggered by leaving edit mode
    runLater(function() {
      modal.close();
    }, 50);
  },

  titleToken() {
    return i18n.t('board_layout_page_title', "Board Layout");
  }
});
