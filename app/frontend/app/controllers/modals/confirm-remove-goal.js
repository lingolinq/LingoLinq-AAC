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
import { inject as service } from '@ember/service';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';

export default class ConfirmRemoveGoalController extends modal.ModalController {
  @service store;

  @tracked status = null;
  @tracked auto_conclude = false;

  opening() {
    this.status = null;
    this.auto_conclude = false;
  }

  @action
  confirm() {
    this.status = {saving: true};
    this.store.findRecord('unit', this.model.source.id).then((unit) => {
      unit.set('goal', {remove: true, auto_conclude: this.auto_conclude});
      unit.save().then(() => {
        unit.set('goal', null);
        modal.close({confirmed: true});
      }, () => {
        this.status = {error: true};
      });
    }, (err) => {
      this.status = {error: true};
    })
  }
}
