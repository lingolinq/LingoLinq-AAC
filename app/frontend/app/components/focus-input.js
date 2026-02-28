import capabilities from '../utils/capabilities';
import TextField from '@ember/component/text-field';
import $ from 'jquery';
import { observer } from '@ember/object';

export default TextField.extend({
  becomeFocused: function () {
    if (!capabilities.mobile || this.get('force')) {
      this.element.classList.add('auto_focus');
      $(this.element).focus().select();
    }
  }.on('didInsertElement'),
  focusOut: function () {
    if (this.action) {
      this.action();
    }
  },
  keyDown: function (event) {
    if (event.keyCode == 13 || event.code == "Enter") {
      event.preventDefault();
      event.stopPropagation();
      if (this.get('select')) {
        if (this.select) {
          this.select();
        }
      }
    }
  }
});
