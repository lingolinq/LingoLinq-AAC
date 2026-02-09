import Component from '@ember/component';
import { inject as service } from '@ember/service';
import modal from '../utils/modal';

/**
 * Premium Required modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'premium-required';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
    if (this.get('appState').get('currentUser.user_name') === 'edi') {
      this.set('show_reason', true);
    }
  },

  actions: {
    close() {
      this.get('modal').close(!this.get('model.cancel_on_close'));
    },
    opening() {},
    closing() {}
  }
});
