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
import obf from '../../utils/obf';
import { htmlSafe } from '@ember/template';
import { computed } from '@ember/object';

export default modal.ModalController.extend({
  opening: function() {
    this.set('current_section_id', this.get('model.section_id'));
  },
  current_section: computed('current_section_id', function() {
    var _this = this;
    var section = this.get('sections').find(function(s) { return s.id == _this.get('current_section_id'); }) || this.get('sections')[0];
    return section.name;
  }),
  current_description: computed('current_section_id', function() {
    var _this = this;
    var section = this.get('sections').find(function(s) { return s.id == _this.get('current_section_id'); }) || this.get('sections')[0];
    return section.description;
  }),
  sections: computed(function() {
    return obf.eval.sections();
  }),
  actions: {
    move: function(direction) {
      var _this = this;
      var sections = _this.get('sections');
      var section = _this.get('sections').find(function(s) { return s.id == _this.get('current_section_id'); }) || this.get('sections')[0];
      var idx = sections.indexOf(section);
      if(idx == -1) {
        idx = 0;
      } else if(direction == 'forward') {
        idx++;
      } else if(direction == 'back') {
        idx--;
      }
      if(idx < 0) {
        idx = sections.length - 1;
      } else if(idx >= sections.length) {
        idx = 0;
      }
      _this.set('current_section_id', sections[idx].id);
    },
    jump: function() {
      modal.close();
      obf.eval.jump_to(this.get('current_section_id'));
    }
  }
});
