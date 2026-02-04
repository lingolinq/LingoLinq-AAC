import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { later as runLater } from '@ember/runloop';
import i18n from '../utils/i18n';
import session from '../utils/session';
import modalUtil from '../utils/modal';

/**
 * Confirm Delete User Modal Component
 *
 * Converted from modals/confirm-delete-user template/controller to component
 * for the new service-based modal system.
 */
export default Component.extend({
  modal: service('modal'),
  persistence: service('persistence'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'modals/confirm-delete-user';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
    this.set('user_name', '');
    this.set('error', null);
    this.set('user', null);
  },

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      this.get('modal').setComponent(this);
      this.set('user', this.get('model.user'));
      this.set('error', null);
      this.set('user_name', '');
    },
    closing() {},
    delete_user() {
      const user = this.get('user');
      const user_name = this.get('user_name');
      if (user_name !== user.user_name) {
        this.set('error', i18n.t('wrong_user_name', "User name isn't correct"));
      } else {
        this.persistence.ajax('/api/v1/users/' + user_name + '/flush/user', {
          type: 'POST',
          data: {
            confirm_user_id: user.id,
            user_name: user_name
          }
        }).then(() => {
          this.get('modal').close();
          modalUtil.success(i18n.t('user_to_be_deleted', "Your user account will be deleted within approximately the next 24 hours."), false, true);
          runLater(function() {
            session.invalidate();
          }, 10000);
        }, () => {
          this.set('error', i18n.t('user_delete_failed', "User account delete failed unexpectedly"));
        });
      }
    }
  }
});
