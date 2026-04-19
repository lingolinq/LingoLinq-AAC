import Route from '@ember/routing/route';
import i18n from '../../utils/i18n';

export default Route.extend({
  model: function() {
    var user = this.modelFor('user');
    user.set('subroute_name', i18n.t('preferences', 'settings'));
    return user;
  },
  setupController: function(controller, model) {
    model.set('watch_cookies', true);
    this.set('controller', controller);
    controller.set('model', model);
    controller.setup();
    controller.set('add_sidebar_board_error', null);
    controller.check_core_words();
    controller.check_voices_available();
    controller.set_auto_sync();
    controller.check_calibration();
    controller.set('status', null);
  },
  actions: {
    willTransition: function(transition) {
      // save preferences if they aren't cancelled or already being saved
      if(!this.get('controller.skip_save_on_transition')) {
        var orig_prefs = JSON.stringify(this.get('controller.original_preferences') || {});
        var new_prefs = JSON.stringify(this.get('controller.pending_preferences') || {});
        if(orig_prefs != new_prefs) {
          this.controller.send('savePreferences', true);
        }
      }
      return true;
    }
  }
});
