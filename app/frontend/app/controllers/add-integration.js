import { inject as service } from '@ember/service';
import modal from '../utils/modal';

import LingoLinq from '../app';

export default modal.ModalController.extend({
  modal: service(),

  opening: function() {
    var integration = LingoLinq.store.createRecord('integration', {
      custom_integration: true,
      user_id: this.get('model.user.id')
    });
    this.set('status', null);
    this.set('integration', integration);
  },
  actions: {
    save: function() {
      var _this = this;
      _this.set('status', {saving: true});
      var integration = this.get('integration');
      if(!integration.get('with_button_url')) {
        integration.set('button_webhook_url', null);
        integration.set('button_webhook_local', null);
      }
      if(!integration.get('with_board_url')) {
        integration.set('board_render_url', null);
      }
      var hooks = [];
      integration.save().then(function(res) {
        this.modal.close({created: true});
        this.modal.open('integration-details', {integration: integration});
      }, function(err) {
        _this.set('status', {error: true});
      });
    }
  }
});
