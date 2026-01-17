import i18n from '../../utils/i18n';
import modal from '../../utils/modal';
import persistence from '../../utils/persistence';
import session from '../../utils/session';
import { later as runLater } from '@ember/runloop';
import { inject as service } from '@ember/service';

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
    delete_user: function() {
      if(this.get('user_name') != this.get('user.user_name')) {
        this.set('error', i18n.t('wrong_user_name', "User name isn't correct"));
      } else {
        var _this = this;
        this.persistence.ajax('/api/v1/users/' + this.get('user_name') + '/flush/user', {
          type: 'POST',
          data: {
            confirm_user_id: this.get('user.id'),
            user_name: this.get('user_name')
          }
        }).then(function(res) {
          this.modal.close();
          modal.success(i18n.t('user_to_be_deleted', "Your user account will be deleted within approximately the next 24 hours."), false, true);
          runLater(function() {
            session.invalidate();
          }, 10000);

        }, function() {
          _this.set('error', i18n.t('user_delete_failed', "User account delete failed unexpectedly"));
        });
      }
    }
  }
});
