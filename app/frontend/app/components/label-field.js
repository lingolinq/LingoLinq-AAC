import Component from '@ember/component';
import $ from 'jquery';
import editManager from '../utils/edit_manager';
import { observer } from '@ember/object';

export default Component.extend({
  tagName: 'input',
  type: 'text',
  attributeBindings: ['placeholder', 'value'],
  change: function() {
    this.set('changed_value', this.get('element').value);
  },
  valueChange: observer('changed_value', function() {
    var id = $(this.get('element')).closest('.button').attr('data-id');
    var button = editManager.find_button(id);
    if(button && this.get('changed_value') != button.label) {
      editManager.change_button(id, {
        label: this.get('changed_value')
      });
    }
  }),
  focusIn: function(event) {
    var id = $(this.get('element')).closest('.button').attr('data-id');
    editManager.clear_text_edit();
  },
  keyDown: function(event) {
    if(event.keyCode == 13 || event.code == 'Enter') {
      this.change.call(this);
      var id = $(this.get('element')).closest('.button').attr('data-id');
      editManager.lucky_symbol(id);
    }
  },
  focusOut: function() {
    var id = $(this.get('element')).closest('.button').attr('data-id');
    editManager.lucky_symbol(id);
  }

});
