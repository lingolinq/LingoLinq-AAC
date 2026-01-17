import modal from '../../utils/modal';
import obf from '../../utils/obf';
import { htmlSafe } from '@ember/string';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

export default modal.ModalController.extend({
  modal: service(),

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
      this.modal.close();
      obf.eval.jump_to(this.get('current_section_id'));
    }
  }
});
