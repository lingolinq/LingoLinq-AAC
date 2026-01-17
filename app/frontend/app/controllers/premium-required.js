import { inject as service } from '@ember/service';
import modal from '../utils/modal';

import app_state from '../utils/app_state';

export default modal.ModalController.extend({
  appState: service('app-state'),
  modal: service(),

  opening: function() {
    if(this.appState.get('currentUser.user_name') == 'edi') {
      this.set('show_reason');
    }
  },
  actions: {
    close: function() {
      this.modal.close(!this.get('model.cancel_on_close'));
    }
  }
});
