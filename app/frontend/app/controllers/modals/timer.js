import modal from '../../utils/modal';
import utterance from '../../utils/utterance';
import capabilities from '../../utils/capabilities';
import app_state from '../../utils/app_state';
import speecher from '../../utils/speecher';
import i18n from '../../utils/i18n';
import { htmlSafe } from '@ember/template';
import { set as emberSet, get as emberGet } from '@ember/object';
import { later as runLater } from '@ember/runloop';

export default modal.ModalController.extend({
  actions: {
    speak: function() {
      if(this.get('holding')) { return; }
      speecher.speak_text(i18n.t('times_up', "Time's Up!"));
      if(app_state.get('currentUser.preferences.vibrate_buttons') && app_state.get('speak_mode')) {
        capabilities.vibrate();
      }
      modal.close();
    }
  }
});
