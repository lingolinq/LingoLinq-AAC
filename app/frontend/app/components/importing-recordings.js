import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import { htmlSafe } from '@ember/template';
import modal from '../utils/modal';

/**
 * Importing Recordings modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'importing-recordings';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  progress: computed('model.progress', 'model.status', function() {
    return this.get('model.progress') || this.get('model.status') || {};
  }),

  num_percent: computed('progress.percent', function() {
    return Math.round(100 * (this.get('progress.percent') || 0));
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
