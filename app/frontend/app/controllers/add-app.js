import { computed } from '@ember/object';
import modal from '../utils/modal';
import { inject as service } from '@ember/service';

export default modal.ModalController.extend({
  modal: service(),

  device: computed(function() {
    return {
      standalone: navigator.standalone,
      android: (navigator.userAgent.match(/android/i) && navigator.userAgent.match(/chrome/i)),
      ios: (navigator.userAgent.match(/mobile/i) && navigator.userAgent.match(/safari/i))
    };
  }),
  actions: {
    close: function() {
      this.modal.close();
    }
  }
});
