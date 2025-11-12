import LingoLinq from '../app';
import editManager from '../utils/edit_manager';
import modal from '../utils/modal';
import stashes from '../utils/_stashes';
import Button from '../utils/button';
import { htmlSafe } from '@ember/string';
import { computed } from '@ember/object';

export default modal.ModalController.extend({
  opening: function() {
    this.set('model', {});
    var time_cutoff = (new Date()).getTime() - (7 * 24 * 60 * 60 * 1000);
    var default_stashed_at = 1449599949597;
    var current_buttons = (stashes.get_object('stashed_buttons', true) || []).reverse().filter(function(b) { return (b.stashed_at || default_stashed_at) > time_cutoff; });
    var stash = current_buttons.slice(0, 48).map(function(b) {
      delete b.stashed_at;
      var button = Button.create(b);
      button.set('outer_display_class', button.get('outer_display_class') + ' stashed_button');
      button.set('positioning', {height: 100});
      return button;
    });
    this.set('button_stashes', stash);
  },
  actions: {
    pickButton: function(button) {
      editManager.get_ready_to_apply_stashed_button(button);
      modal.close(true);
    }
  },
  outer_button_style: computed('model.id', function() {
    return "width: 33%; height: 100px; padding: 5px;";
  }),
  inner_button_style: computed('model.id', function() {
    var height = 100 - LingoLinq.borderPad;
    return "height: " + height + "px;";
  }),
  image_style: computed('model.id', function() {
    var height = 100 - LingoLinq.labelHeight - LingoLinq.boxPad;
    return htmlSafe("height: " + height + "px;");
  })
});
