import modal from '../../utils/modal';
import utterance from '../../utils/utterance';
import capabilities from '../../utils/capabilities';
import app_state from '../../utils/app_state';
import speecher from '../../utils/speecher';
import i18n from '../../utils/i18n';
import { htmlSafe } from '@ember/string';
import { set as emberSet, get as emberGet } from '@ember/object';
import { later as runLater } from '@ember/runloop';
import { inject as service } from '@ember/service';

export default modal.ModalController.extend({
  appState: service('app-state'),
  modal: service(),

  actions: {
    speak: function() {
      if(this.get('holding')) { return; }
      speecher.speak_text(i18n.t('times_up', "Time's Up!"));
      if(this.appState.get('currentUser.preferences.vibrate_buttons') && this.appState.get('speak_mode')) {
        capabilities.vibrate();
      }
      this.modal.close();
    }
  }
});
