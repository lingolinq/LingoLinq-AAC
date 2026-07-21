import { modifier } from 'ember-modifier';
import capabilities from '../utils/capabilities';

/**
 * On insert, auto-focus the element and select its text — unless on mobile
 * (where popping the keyboard unprompted is disruptive), which `force` overrides.
 * Replaces focus-input's classic didInsertElement.
 *
 * Usage: <input ... {{autofocus-select force=@force}} />
 */
export default modifier(function autofocusSelect(element, positional, named) {
  if (!capabilities.mobile || named.force) {
    element.classList.add('auto_focus');
    element.focus();
    if (typeof element.select === 'function') {
      element.select();
    }
  }
});
