import capabilities from '../utils/capabilities';
import { TextField } from '@ember/legacy-built-in-components';
import $ from 'jquery';

export default TextField.extend({
  didInsertElement() {
    this._super(...arguments);
    if (!capabilities.mobile || this.get('force')) {
      this.element.classList.add('auto_focus');
      $(this.element).focus().select();
    }
  },
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
