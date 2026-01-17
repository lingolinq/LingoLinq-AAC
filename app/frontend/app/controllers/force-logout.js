import session from '../utils/session';
import modal from '../utils/modal';

export default modal.ModalController.extend({
  actions: {
    logout: function() {
      this.set('logging_out', true);
      session.invalidate(true);
    }
  }
});
