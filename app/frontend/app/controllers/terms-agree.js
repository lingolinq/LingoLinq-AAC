import { inject as service } from '@ember/service';
import modal from '../utils/modal';

import app_state from '../utils/app_state';

export default modal.ModalController.extend({
  appState: service('app-state'),

  actions: {
    confirm: function() {
      var user = this.appState.get('currentUser');
      var _this = this;
      if(user) {
        user.set('terms_agree', true);
        user.save().then(function() {
          _this.send('close');
          this.appState.set('auto_setup', true);
          if(!user.get('preferences.progress.intro_watched')) {
            _this.transitionToRoute('setup', {queryParams: {user_id: null, page: null}});
          }
        }, function() {
          _this.set('agree_error', true);
        });
      } else {
        _this.send('close');
      }
    }
  }
});
