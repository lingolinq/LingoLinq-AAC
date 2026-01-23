import modal from '../utils/modal';
import { inject as service } from '@ember/service';

export default modal.ModalController.extend({
  appState: service('app-state'),
  
  actions: {
    confirm: function() {
      var _this = this;
      var user = this.appState.get('currentUser');
      if(user) {
        user.set('terms_agree', true);
        user.save().then(function() {
          _this.send('close');
          _this.appState.set('auto_setup', true);
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
