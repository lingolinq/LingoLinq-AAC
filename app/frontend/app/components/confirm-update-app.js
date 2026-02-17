import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';

/**
 * Confirm app update modal (Phase 2).
 * Converted from confirm-update-app controller/template.
 */
export default Component.extend({
  modal: service('modal'),
  tagName: '',

  version: computed(function() {
    return (window.LingoLinq && window.LingoLinq.update_version) || 'unknown';
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    restart() {
      if (window.LingoLinq && window.LingoLinq.install_update) {
        window.LingoLinq.install_update();
      } else {
        this.set('error', true);
      }
    }
  }
});
