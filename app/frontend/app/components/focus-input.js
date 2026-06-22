import capabilities from '../utils/capabilities';
import { TextField } from '@ember/legacy-built-in-components';
import $ from 'jquery';

export default TextField.extend({
  // `aria-label` is not in TextField's default attributeBindings, so an aria-label
  // passed to a focus-input would set a property but never reach the DOM. Bind it here
  // (concatenated with the inherited bindings) so callers can give the input an
  // accessible name. Only renders when an aria-label is actually provided.
  attributeBindings: ['aria-label'],
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
