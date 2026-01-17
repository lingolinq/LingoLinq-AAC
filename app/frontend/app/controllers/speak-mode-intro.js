import { inject as service } from '@ember/service';
import modal from '../utils/modal';

import app_state from '../utils/app_state';

export default modal.ModalController.extend({
  appState: service('app-state'),

  opening: function() {
    var user = this.appState.get('currentUser');
    if(user) {
      var progress = user.get('preferences.progress') || {};

      progress.speak_mode_intro_done = (new Date()).getTime();
      this.appState.set('speak-mode-intro', true);
      user.set('preferences.progress', progress);
      user.save().then(null, function() { });
    }
  },
  closing: function() {
    var user = this.appState.get('currentUser');
    if(user && !user.get('preferences.progress.speak_mode_intro_done')) {
      var progress = user.get('preferences.progress') || {};

      progress.modeling_intro_done = (new Date()).getTime();
      user.set('preferences', user.get('preferences') || {});
      user.set('preferences.progress', progress);
      user.save().then(null, function() { });
    }
  }
});
