import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import obf from '../utils/obf';

/**
 * Eval Jump Modal Component
 *
 * Converted from modals/eval-jump template/controller to component
 * for the new service-based modal system.
 */
export default Component.extend({
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'modals/eval-jump';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
    this.set('current_section_id', options.section_id || null);
  },

  sections: computed(function() {
    return obf.eval.sections();
  }),

  current_section: computed('current_section_id', 'sections.[]', function() {
    const section = (this.get('sections') || []).find(s => s.id === this.get('current_section_id')) || (this.get('sections') || [])[0];
    return section ? section.name : '';
  }),

  current_description: computed('current_section_id', 'sections.[]', function() {
    const section = (this.get('sections') || []).find(s => s.id === this.get('current_section_id')) || (this.get('sections') || [])[0];
    return section ? section.description : '';
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      this.get('modal').setComponent(this);
      this.set('current_section_id', this.get('model.section_id'));
    },
    closing() {},
    nothing() {},
    move(direction) {
      const sections = this.get('sections') || [];
      const section = sections.find(s => s.id === this.get('current_section_id')) || sections[0];
      let idx = sections.indexOf(section);
      if (idx === -1) { idx = 0; }
      else if (direction === 'forward') { idx++; }
      else if (direction === 'back') { idx--; }
      if (idx < 0) { idx = sections.length - 1; }
      else if (idx >= sections.length) { idx = 0; }
      this.set('current_section_id', sections[idx].id);
    },
    jump() {
      this.get('modal').close();
      obf.eval.jump_to(this.get('current_section_id'));
    }
  }
});
