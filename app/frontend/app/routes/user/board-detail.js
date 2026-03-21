import Route from '@ember/routing/route';
import i18n from '../../utils/i18n';
import speecher from '../../utils/speecher';

export default Route.extend({
  model: function(params) {
    var user = this.modelFor('user');
    user.set('subroute_name', i18n.t('board_detail', 'Board Detail'));
    return {
      user: user,
      boardname: params.boardname
    };
  },
  setupController: function(controller, model) {
    controller.set('model', model);
    controller.set('user', model.user);
    controller.set('boardname', model.boardname);
    controller.load_board();

    // Initialize the user's saved voice for speech synthesis
    var user = model.user;
    if(user && user.get && user.get('preferences.device.voice')) {
      user.update_voice_uri();
      speecher.set_voice(
        user.get('preferences.device.voice'),
        user.get('preferences.device.alternate_voice')
      );
    }
  },
  resetController: function(controller, isExiting) {
    if(isExiting) {
      controller.set('board_buttons', null);
      controller.set('active_category', 'all');
      controller.set('sentence_parts', []);
      controller.set('recent_phrases', []);
    }
  }
});
