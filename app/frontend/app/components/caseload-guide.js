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
  },

  // init(), NOT didInsertElement(): the template binds these bare —
  // `{{on "click" this.onClose}}` and `@opening={{this.onOpening}}` — and the
  // modifier installs during render, BEFORE didInsertElement runs. Assigning
  // them there left the modifier binding `undefined`, which threw
  // `Cannot read properties of undefined (reading 'bind')` at install and made
  // the X button dead (Escape and backdrop still worked, because modal-dialog
  // falls back to modal.close() when @action is undefined).
  init() {
    this._super(...arguments);
    var self = this;
    this.onClose = function() { self.send('close'); };
    this.onOpening = function() { self.send('opening'); };
    this.onClosing = function() { self.send('closing'); };
  }
});
