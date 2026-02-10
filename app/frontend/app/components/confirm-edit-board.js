import Component from '@ember/component';
import { inject as service } from '@ember/service';
import modal from '../utils/modal';

/**
 * Confirm Edit Board modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'confirm-edit-board';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options.board || options.model);
  },

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    tweakBoard() {
      this.get('modal').close('tweak');
    },
    editBoard() {
      this.get('modal').close();
      this.get('appState').toggle_edit_mode(true);
    }
  }
});
