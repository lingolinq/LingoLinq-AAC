import modal from '../utils/modal';
import { inject as service } from '@ember/service';

export default modal.ModalController.extend({
  appState: service('app-state'),
  
  opening: function() {
    if(this.appState.get('currentUser.user_name') == 'edi') {
      this.set('show_reason');
    }
  },
  actions: {
    close: function() {
      modal.close(!this.get('model.cancel_on_close'));
    }
  }
});
