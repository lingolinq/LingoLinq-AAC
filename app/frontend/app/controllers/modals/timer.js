/*
 * ⚠️ ORPHANED MODAL CONTROLLER — NOT CURRENTLY WIRED INTO THE APP (kept for team review).
 *
 * During the component-modal migration this modal was reimplemented as the co-located
 * component `app/components/<same-name>.{js,hbs}`, which is what actually renders now
 * (via `components/modal-container.js` -> its `convertedModals` list). There is no
 * `app/templates/modals/<name>.hbs` backing this controller, and nothing imports it or
 * resolves it through `controllerFor`, so Ember never instantiates it. As of the Ember
 * 5.12 work this is dead code.
 *
 * REVIEW NEEDED: DELETE this file, OR RE-WIRE it if the team still wants the modal. If you
 * revive it, reconcile with the component version first — the two have diverged since the
 * split (fixes landed in the component, not here).
 * Context: docs/task-management/2026-07-14-ember-5-12-full-deprecation-audit.md
 */

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
