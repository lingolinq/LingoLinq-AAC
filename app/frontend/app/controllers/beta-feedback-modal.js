import modal from '../utils/modal';

export default modal.ModalController.extend({
  actions: {
    onSubmitSuccess() {
      modal.close('beta-feedback-modal');
    },
    onCancel() {
      modal.close('beta-feedback-modal');
    }
  }
});
