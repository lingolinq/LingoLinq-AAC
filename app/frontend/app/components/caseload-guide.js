import Component from '@ember/component';
import { inject as service } from '@ember/service';

/**
 * Caseload Guide Modal Component
 *
 * Static, info-only reference for supervisors: what each row quick-action icon
 * does, and what opening a communicator's card lets you do. Opened from the
 * "People you support" subheader info button (controllers/caseload.js).
 */
export default Component.extend({
  modal: service('modal'),
  tagName: '',

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      this.get('modal').setComponent(this);
    },
    closing() {
    }
  }
});
