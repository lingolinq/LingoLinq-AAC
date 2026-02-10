import Component from '@ember/component';
import { inject as service } from '@ember/service';
import modal from '../utils/modal';

/**
 * Confirm Needs Copying modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'confirm-needs-copying';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options.board || options.model);
  },

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    confirm() {
      this.get('modal').close('confirm');
    }
  }
});
