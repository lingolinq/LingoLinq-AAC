import capabilities from '../utils/capabilities';
import modal from '../utils/modal';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

export default modal.ModalController.extend({
  modal: service(),

  non_https: computed('model.url', function() {
    return (this.get('model.url') || '').match(/^http:/);
  }),
  actions: {
    open_link: function() {
      this.modal.close({open: true});
    }
  }
});
