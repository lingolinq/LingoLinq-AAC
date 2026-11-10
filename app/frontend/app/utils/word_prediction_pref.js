import modal from './modal';
import i18n from './i18n';
import { save_listed_preferences } from './preference_save';

/* The inline-sidebar "Predict" Yes/No control (2026-10-13), for the application and board-detail
   controllers, which each had an identical copy until 2026-10-22. Writes preferences.word_suggestions
   on the on-screen user (referenced_user in Speak Mode, else currentUser), the preference
   board/index.js and user/board-detail.js gate the prediction rail on. SETS a value (not a flip) so the
   segmented control is idempotent; clicking the already-selected side is a no-op and never prompts.
   Gated by the ACTIVE speak-mode PIN: open_speak_mode_exit_pin resolves {correct_pin:true} immediately
   when no PIN is active (app-state.js), so the no-PIN case applies with no prompt.
   Saves only this key (utils/preference_save.js). preferences.device.updated is still set so Ember Data
   sees the record as changed (it does not mark a nested set dirty on its own). */
export function set_word_prediction(appState, on) {
  var prefUser = appState.get('referenced_user') || appState.get('currentUser');
  if(!prefUser) { return; }
  if((prefUser.get('preferences.word_suggestions') === true) === !!on) { return; }
  var apply = function() {
    prefUser.set('preferences.word_suggestions', !!on);
    if(prefUser.save) {
      // CREATE the device container first: set('preferences.device.updated') THROWS on a
      // record whose preferences carry no `device` key (components/view-switcher.js:186).
      if(!prefUser.get('preferences.device')) { prefUser.set('preferences.device', {}); }
      prefUser.set('preferences.device.updated', true);
      save_listed_preferences(prefUser, ['word_suggestions']).then(null, function() {
        // Save failed (offline, or a supervisor without write access to the communicator):
        // put the control back to the stored value and say so, rather than leaving it showing
        // a change the server never received.
        if(prefUser.isDestroyed || prefUser.isDestroying) { return; }
        prefUser.set('preferences.word_suggestions', !on);
        modal.error(i18n.t('word_prediction_save_failed', "Couldn't save the Prediction setting. Please try again."));
      });
    }
  };
  var ready = appState.open_speak_mode_exit_pin('none');
  if(ready && ready.then) {
    ready.then(function(res) { if(res && res.correct_pin) { apply(); } }, function() { });
  } else {
    apply();
  }
}
