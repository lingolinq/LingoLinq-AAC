import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';
import i18n from '../../utils/i18n';
import speecher from '../../utils/speecher';
import editManager from '../../utils/edit_manager';
import contentGrabbers from '../../utils/content_grabbers';

export default Route.extend({
  store: service('store'),
  stashes: service('stashes'),
  appState: service('app-state'),
  persistence: service('persistence'),

  model: function(params) {
    var user = this.modelFor('user');
    user.set('subroute_name', i18n.t('board_detail', "Board Detail"));
    return {
      user: user,
      boardname: params.boardname
    };
  },

  setupController: function(controller, model) {
    var _this = this;
    var user = model.user;

    controller.set('user', user);
    controller.set('boardname', model.boardname);
    controller.set('ordered_buttons', null);
    controller.set('preview_level', null);

    // Default panels to collapsed on small screens
    controller.set('panels_collapsed', window.innerWidth <= 820);

    // Initialize the user's saved voice for speech synthesis
    if(user && user.get && user.get('preferences.device.voice')) {
      user.update_voice_uri();
      speecher.set_voice(
        user.get('preferences.device.voice'),
        user.get('preferences.device.alternate_voice')
      );
    }

    // Load the board data via persistence.ajax (the proven approach)
    // and also load the Ember Data model for editManager integration
    controller.load_board();
  },

  resetController: function(controller, isExiting) {
    if(isExiting) {
      controller.set('ordered_buttons', null);
      controller.set('board_data', null);
      controller.set('active_category', 'all');
      controller.set('sentence_parts', []);
      controller.set('recent_phrases', []);
      controller.set('edit_mode', false);
      controller.set('paint_mode', null);
      controller.set('color_picker_button', null);
      if(editManager.controller === controller) {
        editManager.controller = null;
      }
    }
  }
});
