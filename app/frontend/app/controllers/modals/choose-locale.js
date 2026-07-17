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
import i18n from '../../utils/i18n';
import utterance from '../../utils/utterance';
import RSVP from 'rsvp';
import stashes from '../../utils/_stashes';
import { computed } from '@ember/object';

export default modal.ModalController.extend({
  opening: function() {
    this.set('lang', stashes.get('display_lang'));
  },
  locales: computed(function() {
    var list = i18n.locales_translated || ['en'];
    return list.map(function(loc) {
      var auto_translated = loc.match(/\*/);
      var loc = loc.replace(/\*/, '');
      var name = i18n.locales_localized[loc] || i18n.locales[loc] || loc;
      name = name + " (" + loc + ")";
      if(auto_translated) {
        name = name + " (auto-translated)";
      }
      return {
        name: name, 
        id: loc
      };  
    });
  }),
  actions: {
    update: function() {
      stashes.persist('display_lang', this.get('lang'));
      setTimeout(function() {
        location.reload();
      }, 1000);
    },
  }
});
