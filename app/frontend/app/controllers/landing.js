import Controller from '@ember/controller';
import modal from '../utils/modal';

export default Controller.extend({
  actions: {
    support() {
      // placeholder for support/help action
    },
    showFeatures() {
      modal.open('landing-features-modal');
    }
  }
});
