import Component from '@ember/component';
import { inject as service } from '@ember/service';

export default Component.extend({
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    var modal = this.get('modal');
    var template = 'fsa-features-modal';
    var options = (modal && modal.getSettingsFor && modal.getSettingsFor(template)) ||
                  (modal && modal.settingsFor && modal.settingsFor[template]) ||
                  this.get('model') || {};
    this.set('model', options);
  },

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      var component = this;
      this.get('modal').setComponent(component);
    },
    closing() {
    }
  }
});
