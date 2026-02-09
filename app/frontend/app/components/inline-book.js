import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import modal from '../utils/modal';

/**
 * Inline Book modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'inline-book';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  book_url: computed('model.url', function() {
    return 'https://tools.openaac.org/tarheel/launch#' + this.get('model.url');
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {}
  }
});
