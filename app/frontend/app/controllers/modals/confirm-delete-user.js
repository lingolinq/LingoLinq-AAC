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
import session from '../../utils/session';
import { later as runLater } from '@ember/runloop';
import { inject as service } from '@ember/service';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';

export default class ConfirmDeleteUserController extends modal.ModalController {
  @service persistence;

  @tracked user_name = '';
  @tracked error = null;
  @tracked user = null;

  opening() {
    this.user = this.model.user;
    this.error = null;
    this.user_name = '';
  }

  @action
  delete_user() {
    if(this.user_name != this.user.user_name) {
      this.error = i18n.t('wrong_user_name', "User name isn't correct");
    } else {
      this.persistence.ajax('/api/v1/users/' + this.user_name + '/flush/user', {
        type: 'POST',
        data: {
          confirm_user_id: this.user.id,
          user_name: this.user_name
        }
      }).then((res) => {
        modal.close();
        modal.success(i18n.t('user_to_be_deleted', "Your user account will be deleted within approximately the next 24 hours."), false, true);
        runLater(function() {
          session.invalidate();
        }, 10000);

      }, () => {
        this.error = i18n.t('user_delete_failed', "User account delete failed unexpectedly");
      });
    }
  }
}
