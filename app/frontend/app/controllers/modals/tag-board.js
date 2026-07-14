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

import LingoLinq from '../../app';
import modal from '../../utils/modal';
import BoardHierarchy from '../../utils/board_hierarchy';
import i18n from '../../utils/i18n';
import stashes from '../../utils/_stashes';
import app_state from '../../utils/app_state';
import persistence from '../../utils/persistence';
import progress_tracker from '../../utils/progress_tracker';
import { computed } from '@ember/object';

export default modal.ModalController.extend({
  opening: function() {
    this.set('status', null);
    if(!this.get('model.user.board_tags')) {
      this.get('model.user').reload();
    }
  },
  actions: {
    update: function() {
      var downstream = !!this.get('downstream');
      var _this = this;
      _this.set('status', {loading: true});
      _this.get('model.user').tag_board(_this.get('model.board'), this.get('tag'), false, downstream).then(function() {
        _this.set('status', null);
        modal.close();
        modal.success(i18n.t('categorization_complete', "Board Categorization Complete"));
      }, function() {
        _this.set('status', {error: true});
      });
    }
  }
});
