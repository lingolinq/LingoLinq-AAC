import Component from '@ember/component';
import { inject as service } from '@ember/service';

export default Component.extend({
  modal: service('modal'),
  tagName: '',
  currentStep: 1,

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'beta-onboarding-modal';
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
    nextStep() {
      this.set('currentStep', 2);
    },
    prevStep() {
      this.set('currentStep', 1);
    }
  }
});
