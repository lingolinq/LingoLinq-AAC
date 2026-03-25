import Component from '@ember/component';
import { inject as service } from '@ember/service';
import modal from '../utils/modal';

export default Component.extend({
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    var modalService = this.get('modal');
    var template = 'confirm-set-home';
    var options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                  (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                  this.get('model') || {};
    this.set('model', options);
  },

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    confirm() {
      modal.close({ confirmed: true });
    }
  }
});
