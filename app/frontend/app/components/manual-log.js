import Component from '@ember/component';
import { inject as service } from '@ember/service';

/**
 * Manual Log Modal Component
 *
 * Converted from modals/manual-log template/controller to component
 * for the new service-based modal system.
 * Allows manually entering a communication session (words/phrases per line, date, time).
 */
export default Component.extend({
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'modals/manual-log';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
    const now = new Date();
    const dateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    const timeStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    this.set('date', dateStr);
    this.set('time', timeStr);
    this.set('words', '');
  },

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      // Optional lifecycle hook
    },
    closing() {
      // Optional lifecycle hook
    },
    submit() {
      const words = (this.get('words') || '').trim();
      const dateStr = this.get('date') || '';
      const timeStr = (this.get('time') || '').trim();
      if (!dateStr) {
        return;
      }
      let dateObj;
      if (timeStr) {
        dateObj = new Date(dateStr + 'T' + timeStr);
      } else {
        dateObj = new Date(dateStr + 'T12:00:00');
      }
      if (isNaN(dateObj.getTime())) {
        return;
      }
      this.get('modal').close({ words: words, date: dateObj });
    }
  }
});
