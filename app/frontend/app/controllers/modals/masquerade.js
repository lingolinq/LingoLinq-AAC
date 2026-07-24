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

import app_state from '../../utils/app_state';
import modal from '../../utils/modal';
import session from '../../utils/session';
import { later as runLater } from '@ember/runloop';

export default modal.ModalController.extend({
  opening: function() {
    this.set('confirmed', false);
  },
  actions: {
    confirm: function() {
      if(!this.get('confirmed')) { return; }
      var data = session.restore();
      data.original_user_name = data.user_name;
      data.as_user_id = this.get('model.user.id');
      data.user_name = this.get('model.user.user_name');
      session.persist(data).then(function() {
        app_state.return_to_index();
        runLater(function() {
          location.reload();
        });
      });
  }
  }
});

