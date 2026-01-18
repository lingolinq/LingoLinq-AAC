import Component from '@ember/component';
import { inject as service } from '@ember/service';
import modalUtil from '../utils/modal';

/**
 * About LingoLinq Modal Component
 * 
 * This is a converted modal template to component for testing the new service-based system.
 * Other modals will be converted incrementally.
 */
export default Component.extend({
  modal: service('modal'),
  tagName: '',
  
  init() {
    this._super(...arguments);
    // Get options from service or passed model
    const modal = this.get('modal');
    const template = 'about-lingolinq';
    const options = (modal && modal.getSettingsFor && modal.getSettingsFor(template)) || 
                    (modal && modal.settingsFor && modal.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },
  
  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      // Opening lifecycle handled by service
      const component = this;
      this.get('modal').setComponent(component);
    },
    closing() {
      // Closing lifecycle
    }
  }
});
