import { inject as service } from '@ember/service';

import modal from '../utils/modal';

export default modal.ModalController.extend({
  modal: service(),

  actions: {
    close: function() {
      this.modal.close();
    }
  }
});
