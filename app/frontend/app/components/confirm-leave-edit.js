import Component from '@ember/component';
import { inject as service } from '@ember/service';

/**
 * Save-or-keep-editing confirmation when leaving the board edit page
 * via "Save and Exit". Returns one of:
 *   'save'    — save changes, then exit
 *   undefined — close (keep editing; modal dismissed via X)
 * Discard was removed here: discarding lives in ONE place only, the
 * "Discard Edits" tile (-> confirm-discard-changes).
 */
export default Component.extend({
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    var modalService = this.get('modal');
    var template = 'confirm-leave-edit';
    var options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                  (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                  this.get('model') || {};
    this.set('model', options);
  },

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    save() {
      this.get('modal').close('save');
    }
  }
});
