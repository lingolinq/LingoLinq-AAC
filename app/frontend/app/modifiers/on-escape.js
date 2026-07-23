import { modifier } from 'ember-modifier';

/**
 * Fires the given handler when Escape is pressed while the element has focus.
 * Native-input replacement for the built-in `<Input @escape-press=...>` action
 * (removed when migrating off built-in form components). The handler is invoked
 * with the keydown event, matching the ctrlAction contract.
 *
 * Usage: <input ... {{on-escape (this.ctrlAction "cancel")}}>
 */
export default modifier(function onEscape(element, positional) {
  var handler = positional[0];
  if (typeof handler !== 'function') {
    return;
  }
  var listener = function(event) {
    if (event.key === 'Escape' || event.keyCode === 27) {
      handler(event);
    }
  };
  element.addEventListener('keydown', listener);
  return function() {
    element.removeEventListener('keydown', listener);
  };
});
