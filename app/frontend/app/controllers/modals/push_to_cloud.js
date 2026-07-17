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
import lingoLinqExtras from '../../utils/extras';
import persistence from '../../utils/persistence';
import app_state from '../../utils/app_state';
import { later as runLater } from '@ember/runloop';

export default modal.ModalController.extend({
  opening: function() {
    var _this = this;
    _this.set('status', null);
    var user_name = app_state.get('currentUser.user_name');
    lingoLinqExtras.storage.find_all('board').then(function(list) {
      _this.set('local_boards', list.filter(function(i) { return i.data && i.data.raw && i.data.raw.user_name == user_name; }).length);
    }, function() { _this.set('local_boards', null)});
  },
  actions: {
    push: function() {
      var _this = this;
      _this.set('status', {pushing: true});
      app_state.get('currentUser').assert_local_boards().then(function(res) {
        _this.set('status', null);
        modal.close();
        modal.success(i18n.t('records_pushed', "Local records have been successfully pushed to the cloud!"));
        runLater(function() {
          persistence.sync('self', null, null, 'push_to_cloud');
        }, 5000);
      }, function(err) {
        if(err.save_failed) {
          _this.set('status', {error: true, save_failed: true});
        }
      });
    }
  }
});
