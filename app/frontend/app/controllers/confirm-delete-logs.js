import { inject as service } from '@ember/service';

import modal from '../utils/modal';
import i18n from '../utils/i18n';
import persistence from '../utils/persistence';

export default modal.ModalController.extend({
  persistence: service(),
  modal: service(),

  opening: function() {
    var user = this.get('model.user');
    this.set('model', {});
    this.set('user', user);
    this.set('error', null);
  },
  actions: {
    delete_logs: function() {
      if(this.get('user_name') != this.get('user.user_name')) {
        this.set('error', i18n.t('wrong_user_name', "User name isn't correct"));
      } else {
        var _this = this;
        this.persistence.ajax('/api/v1/users/' + this.get('user_name') + '/flush/logs', {
          type: 'POST',
          data: {
            confirm_user_id: this.get('user.id'),
            user_name: this.get('user_name')
          }
        }).then(function(res) {
          this.modal.close();
          modal.success(i18n.t('logs_to_be_deleted', "Your logs will be deleted within approximately the next 24 hours."));
        }, function() {
          _this.set('error', i18n.t('delete_failed', "Log delete failed unexpectedly"));
        });
      }
    }
  }
});
