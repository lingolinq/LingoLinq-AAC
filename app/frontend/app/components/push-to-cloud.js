import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { later as runLater } from '@ember/runloop';
import modal from '../utils/modal';
import i18n from '../utils/i18n';
import lingoLinqExtras from '../utils/extras';

/**
 * Push to Cloud Modal Component
 *
 * Converted from modals/push_to_cloud template/controller to component
 * for the new service-based modal system.
 */
export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  persistence: service('persistence'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'modals/push_to_cloud';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
    this.set('status', null);
    const _this = this;
    const user_name = this.get('appState.currentUser.user_name');
    lingoLinqExtras.storage.find_all('board').then(function(list) {
      _this.set('local_boards', list.filter(function(i) { return i.data && i.data.raw && i.data.raw.user_name == user_name; }).length);
    }, function() { _this.set('local_boards', null); });
  },

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    push() {
      const _this = this;
      _this.set('status', { pushing: true });
      _this.get('appState.currentUser').assert_local_boards().then(function() {
        _this.set('status', null);
        modal.close();
        modal.success(i18n.t('records_pushed', "Local records have been successfully pushed to the cloud!"));
        runLater(function() {
          _this.get('persistence').sync('self', null, null, 'push_to_cloud');
        }, 5000);
      }, function(err) {
        if (err && err.save_failed) {
          _this.set('status', { error: true, save_failed: true });
        }
      });
    }
  }
});
