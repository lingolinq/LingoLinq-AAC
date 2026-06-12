import Component from '@ember/component';
import { inject as service } from '@ember/service';
import modal from '../utils/modal';

export default Component.extend({
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'beta-feedback-modal';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
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
    onSubmitSuccess() {
      modal.close('beta-feedback-modal');
    },
    onCancel() {
      modal.close('beta-feedback-modal');
    }
  }
});
