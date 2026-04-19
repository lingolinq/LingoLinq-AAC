import Component from '@ember/component';
import $ from 'jquery';
import editManager from '../utils/edit_manager';
import { observer } from '@ember/object';

export default Component.extend({
  tagName: 'input',
  type: 'text',
  attributeBindings: ['placeholder', 'value', 'aria-label'],

  // Find the button ID from the closest parent with data-id
  _getButtonId: function() {
    var $el = $(this.get('element'));
    var $parent = $el.closest('.button[data-id]');
    if(!$parent.length) {
      $parent = $el.closest('.md-board-detail-symbol-card[data-id]');
    }
    if(!$parent.length) {
      $parent = $el.closest('[data-id]');
    }
    return $parent.attr('data-id');
  },

  change: function() {
    this.set('changed_value', this.get('element').value);
  },
  valueChange: observer('changed_value', function() {
    var id = this._getButtonId();
    var button = editManager.find_button(id);
    if(button && this.get('changed_value') != button.label) {
      editManager.change_button(id, {
        label: this.get('changed_value')
      });
    }
  }),
  focusIn: function(event) {
    editManager.clear_text_edit();
    // Store the original value so Escape can revert changes
    this._original_value = this.get('element').value;
  },
  keyDown: function(event) {
    if(event.keyCode == 13 || event.code == 'Enter') {
      this.change.call(this);
      var id = this._getButtonId();
      editManager.lucky_symbol(id);
      this.get('element').blur();
    } else if(event.keyCode == 27 || event.code == 'Escape') {
      // Revert to the original value and blur
      event.preventDefault();
      event.stopPropagation();
      if(this._original_value !== undefined) {
        this.get('element').value = this._original_value;
        this.set('value', this._original_value);
      }
      this.get('element').blur();
    }
  },
  focusOut: function() {
    var id = this._getButtonId();
    editManager.lucky_symbol(id);
  }
});
