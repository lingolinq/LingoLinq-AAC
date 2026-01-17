import { inject as service } from '@ember/service';
import modal from '../utils/modal';

import app_state from '../utils/app_state';

export default modal.ModalController.extend({
  modal: service(),

  opening: function() {
    this.set('model', this.get('model.board'));
  },
  actions: {
    tweakBoard: function() {
      this.modal.close('tweak');
    },
    editBoard: function() {
      this.modal.close();
      app_state.toggle_edit_mode(true);
    }
  }
});
