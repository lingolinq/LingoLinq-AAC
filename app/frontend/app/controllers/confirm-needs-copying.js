import { inject as service } from '@ember/service';

import modal from '../utils/modal';
import app_state from '../utils/app_state';

export default modal.ModalController.extend({
  modal: service(),

  opening: function() {
    this.set('model', this.get('model.board'));
  },
  actions: {
    confirm: function() {
      this.modal.close('confirm');
    }
  }
});
