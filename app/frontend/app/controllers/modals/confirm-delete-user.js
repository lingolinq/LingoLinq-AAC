import modal from '../../utils/modal';
import i18n from '../../utils/i18n';
import session from '../../utils/session';
import { later as runLater } from '@ember/runloop';
import { inject as service } from '@ember/service';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';

export default class ConfirmDeleteUserController extends modal.ModalController {
  @service persistence;

  @tracked user_name = '';
  @tracked error = null;
  @tracked user = null;

  opening() {
    this.user = this.model.user;
    this.error = null;
    this.user_name = '';
  }

  @action
  delete_user() {
    if(this.user_name != this.user.user_name) {
      this.error = i18n.t('wrong_user_name', "User name isn't correct");
    } else {
      this.persistence.ajax('/api/v1/users/' + this.user_name + '/flush/user', {
        type: 'POST',
        data: {
          confirm_user_id: this.user.id,
          user_name: this.user_name
        }
      }).then((res) => {
        modal.close();
        modal.success(i18n.t('user_to_be_deleted', "Your user account will be deleted within approximately the next 24 hours."), false, true);
        runLater(function() {
          session.invalidate();
        }, 10000);

      }, () => {
        this.error = i18n.t('user_delete_failed', "User account delete failed unexpectedly");
      });
    }
  }
}
