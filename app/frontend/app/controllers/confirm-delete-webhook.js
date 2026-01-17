import { inject as service } from '@ember/service';

import modal from '../utils/modal';

export default modal.ModalController.extend({
  modal: service(),

  actions: {
    delete_webhook: function() {
      var _this = this;
      var webhook = this.get('model.webhook');
      webhook.deleteRecord();
      _this.set('model.deleting', true);
      webhook.save().then(function(res) {
        this.modal.close({deleted: true});
      }, function() {
        _this.set('model.deleting', false);
        _this.set('model.error', true);
      });
    }
  }
});
