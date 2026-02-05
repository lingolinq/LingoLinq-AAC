import Component from '@ember/component';
import { inject as service } from '@ember/service';
import speecher from '../utils/speecher';
import capabilities from '../utils/capabilities';
import app_state from '../utils/app_state';
import i18n from '../utils/i18n';

/**
 * Timer Modal Component
 *
 * Converted from modals/timer template/controller to component
 * for the new service-based modal system.
 */
export default Component.extend({
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'modals/timer';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      this.get('modal').setComponent(this);
    },
    closing() {},
    speak() {
      if (this.get('holding')) { return; }
      speecher.speak_text(i18n.t('times_up', "Time's Up!"));
      if (app_state.get('currentUser.preferences.vibrate_buttons') && app_state.get('speak_mode')) {
        capabilities.vibrate();
      }
      this.get('modal').close();
    }
  }
});
