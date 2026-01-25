import Controller from '@ember/controller';
import i18n from '../utils/i18n';
import persistence from '../utils/persistence';
import app_state from '../utils/app_state';
import modal from '../utils/modal';
import { observer } from '@ember/object';
import { computed } from '@ember/object';

export default Controller.extend({
  queryParams: ['to'],
  to: null,
  recipient_list: [
    {name: i18n.t('general_info', "General Information"), id: "general info"},
    {name: i18n.t('sales', "Sales"), id: "sales"},
    {name: i18n.t('tech_support', "Technical Support"), id: "technical support"}
  ],
  support_recipient: computed('recipient', function() {
    return this.get('recipient') == 'technical support';
  }),
  set_recipient_if_sales: observer('to', function() {
    this.set('recipient', this.get('to'));
  }),
  reset_on_load: observer('app_state.currentUser', function() {
    if(this.get('name') || this.get('email')) { return; }
    this.send('reset');
  }),
  actions: {
    reset: function() {
      this.setProperties({
        name: app_state.get('currentUser.name'),
        email: app_state.get('currentUser.email'),
        recipient: this.get('to') || 'general info',
        subject: '',
        message: ''
      });
    },
    submit_message: function() {
      if(!this.get('email')) { return; }
      var message = {
        name: this.get('name'),
        email: this.get('email'),
        recipient: this.get('recipient'),
        subject: this.get('subject'),
        message: this.get('message')
      };
      var _this = this;
      this.set('disabled', true);
      persistence.ajax('/api/v1/messages', {
        type: 'POST',
        data: {
          message: message
        }
      }).then(function(res) {
        _this.send('reset');
        _this.set('disabled', false);
        modal.success(i18n.t('message_delivered', "Message sent! Thank you for reaching out!"));
      }, function() {
        modal.error(i18n.t('message_delivery_failed', "Message delivery failed, please try again"));
        _this.set('disabled', false);
      });
    }
  }
});
