import Component from '@ember/component';
import { inject as service } from '@ember/service';
import modal from '../utils/modal';
import i18n from '../utils/i18n';
import persistence from '../utils/persistence';

/**
 * Confirm Delete Logs modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'confirm-delete-logs';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  didInsertElement() {
    this._super(...arguments);
    const user = this.get('model.user');
    this.set('user', user);
    this.set('error', null);
  },

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    delete_logs() {
      if (this.get('user_name') !== this.get('user.user_name')) {
        this.set('error', i18n.t('wrong_user_name', "User name isn't correct"));
      } else {
        const _this = this;
        persistence.ajax('/api/v1/users/' + this.get('user_name') + '/flush/logs', {
          type: 'POST',
          data: {
            confirm_user_id: this.get('user.id'),
            user_name: this.get('user_name')
          }
        }).then(function() {
          modal.close();
          modal.success(i18n.t('logs_to_be_deleted', "Your logs will be deleted within approximately the next 24 hours."));
        }, function() {
          _this.set('error', i18n.t('delete_failed', "Log delete failed unexpectedly"));
        });
      }
    }
  }
});
