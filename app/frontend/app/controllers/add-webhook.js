import { inject as service } from '@ember/service';

import modal from '../utils/modal';
import LingoLinq from '../app';

export default modal.ModalController.extend({
  modal: service(),

  opening: function() {
    var webhook = LingoLinq.store.createRecord('webhook', {
      user_id: this.get('model.user.id'),
      webhook_type: 'user'
    });
    this.set('status', null);
    this.set('webhook', webhook);
  },
  actions: {
    save: function() {
      var _this = this;
      _this.set('status', {saving: true});
      var webhook = this.get('webhook');
      var hooks = [];
      if(webhook.get('new_session_event')) { hooks.push('new_session'); }
      if(webhook.get('new_utterance_event')) { hooks.push('new_utterance'); }
      webhook.set('webhooks', hooks);
      webhook.save().then(function(res) {
        this.modal.close({created: true});
      }, function(err) {
        _this.set('status', {error: true});
      });
    }
  }
});
