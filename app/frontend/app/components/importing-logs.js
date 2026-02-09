import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import { htmlSafe } from '@ember/template';

/**
 * Importing Logs Modal Component
 *
 * Converted from modals/importing-logs template/controller to component
 * for the new service-based modal system.
 * Shows progress during log import.
 */
export default Component.extend({
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'modals/importing-logs';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  num_percent: computed('model.progress.percent', function() {
    return Math.round(100 * (this.get('model.progress.percent') || 0));
  }),

  num_style: computed('num_percent', function() {
    return htmlSafe('width: ' + this.get('num_percent') + '%;');
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {}
  }
});
