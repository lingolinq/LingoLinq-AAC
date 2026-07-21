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
import app_state from '../../utils/app_state';
import modal from '../../utils/modal';
import { htmlSafe } from '@ember/template';
import { set as emberSet } from '@ember/object';
import Button from '../../utils/button';
import { computed,  observer } from '@ember/object';
import RSVP from 'rsvp';
import $ from 'jquery';
import stashes from '../../utils/_stashes';
import utterance from '../../utils/utterance';
import i18n from '../../utils/i18n';
import persistence from '../../utils/persistence';
import editManager from '../../utils/edit_manager';
import sync from '../../utils/sync';

export default modal.ModalController.extend({
  opening: function() {
    if(this.get('model.colors') && !this.get('model.colors').forEach) {
      this.set('model.colors', []);
    }
  },
  styled_colors: computed('model.colors', 'model.colors.@each.fill', 'model.colors.@each.border', function() {
    var colors = this.get('model.colors') || [];
    colors.forEach(function(c) {
      emberSet(c, 'style', htmlSafe("border-color: " + Button.clean_text(c.border || '#888') + "; background: " + Button.clean_text(c.fill || '#fff') + ";"));
    });
    return colors;
  }),
  actions: {
    confirm: function() {
      var res = [];
      (this.get('model.colors') || []).forEach(function(row) {
        res.push({
          label: row.label,
          fill: row.fill,
          border: row.border
        })
      });
      modal.close({colors: res});
    },
    remove: function(row) {
      var rows = [].concat(this.get('model.colors') || []);
      rows = rows.filter(function(r) { return r != row; });
      this.set('model.colors', rows);
    },
    add_row: function() {
      var rows = [].concat(this.get('model.colors') || []);
      rows.push({});
      this.set('model.colors', rows);
    }
  }
});
