import modal from '../utils/modal';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

export default modal.ModalController.extend({
  version: computed(function() {
    return (window.LingoLinq && window.LingoLinq.update_version) || 'unknown';
  }),
  actions: {
    restart: function() {
      if(window.LingoLinq && window.LingoLinq.install_update) {
        window.LingoLinq.install_update();
      } else {
        this.set('error', true);
      }
    }
  }
});
