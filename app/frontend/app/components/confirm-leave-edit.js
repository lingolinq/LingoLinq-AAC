import Component from '@ember/component';
import { inject as service } from '@ember/service';

/**
 * Three-option confirmation when leaving the board edit page via the
 * panel's "Back to Boards" action. Returns one of:
 *   'save'    — save changes, then exit to /:user/boards
 *   'discard' — roll back changes, then exit to /:user/boards
 *   undefined — close (modal dismissed via Keep Editing or X)
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
    },
    discard() {
      this.get('modal').close('discard');
    }
  }
});
