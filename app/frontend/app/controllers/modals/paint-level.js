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
import editManager from '../../utils/edit_manager';
import LingoLinq from '../../app';
import { computed } from '@ember/object';

export default modal.ModalController.extend({
  opening: function() {
  },
  paint_types: [
    {name: i18n.t('choose_type', "[ Choose Type ]"), id: ''},
    {name: i18n.t('reveal_button', "Un-Hide the Button"), id: 'hidden'},
    {name: i18n.t('enable_link', "Enable the Link for the Button"), id: 'link_disabled'},
    {name: i18n.t('remove_settings', "Clear All Level Settings"), id: 'clear'},
  ],
  level_select: computed('paint_type', function() {
    return this.get('paint_type') == 'hidden' || this.get('paint_type') == 'link_disabled';
  }),
  paint_levels: LingoLinq.board_levels,
  actions: {
    paint: function() {
      if(this.get('paint_type') && (!this.get('level_select') || this.get('paint_level'))) {
        editManager.set_paint_mode('level', this.get('paint_type'), parseInt(this.get('paint_level'), 10),);
        modal.close();
      }
    }
  }
});
