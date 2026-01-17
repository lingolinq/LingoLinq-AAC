import { inject as service } from '@ember/service';

import modal from '../utils/modal';
import LingoLinq from '../app';

export default modal.ModalController.extend({
  modal: service(),

  opening: function() {
    this.get('model.integration').reload();
  },
  actions: {
    delete_integration: function() {
      var _this = this;
      this.modal.open('confirm-delete-integration', {integration: this.get('model.integration')}).then(function(res) {
        if(res.deleted) {
          _this.get('model.user').check_integrations(true);
        }
      });
    }
  }
});
