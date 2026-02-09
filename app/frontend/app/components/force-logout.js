import Component from '@ember/component';
import { inject as service } from '@ember/service';
import modal from '../utils/modal';
import session from '../utils/session';

/**
 * Force Logout modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'force-logout';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  actions: {
    opening() {},
    closing() {},
    logout() {
      this.set('logging_out', true);
      session.invalidate(true);
    }
  }
});
