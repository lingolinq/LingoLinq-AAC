import modal from '../utils/modal';
import { inject as service } from '@ember/service';

export default modal.ModalController.extend({
  appState: service('app-state'),
  
  actions: {
    toggleSpeakMode: function(decision) {
      this.appState.toggle_speak_mode(decision);
    }
  }  
});
