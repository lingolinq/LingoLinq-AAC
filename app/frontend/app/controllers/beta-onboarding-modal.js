import modal from '../utils/modal';

export default modal.ModalController.extend({
  actions: {
    close() {
      modal.close('beta-onboarding-modal');
    }
  }
});
