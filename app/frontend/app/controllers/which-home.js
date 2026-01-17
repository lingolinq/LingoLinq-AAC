import app_state from '../utils/app_state';
import modal from '../utils/modal';

export default modal.ModalController.extend({
  actions: {
    toggleSpeakMode: function(decision) {
      app_state.toggle_speak_mode(decision);
    }
  }  
});
