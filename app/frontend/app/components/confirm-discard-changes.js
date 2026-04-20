import Component from '@ember/component';
import { inject as service } from '@ember/service';

export default Component.extend({
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    var modalService = this.get('modal');
    var template = 'confirm-discard-changes';
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
    discard() {
      this.get('modal').close('discard');
    }
  }
});
