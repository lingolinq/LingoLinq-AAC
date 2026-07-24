import { modifier } from 'ember-modifier';

/**
 * Fires the given handler when Enter is pressed while the element has focus.
 * Native-input replacement for the built-in `<Input @enter=...>` action (which
 * is removed when migrating off built-in form components, per the
 * `no-builtin-form-components` template-lint rule).
 *
 * The handler is invoked with the keydown event, which matches the `ctrlAction`
 * contract used throughout the app: ctrlAction's returned function detects a
 * trailing event, calls preventDefault, pops it, and dispatches the action with
 * no extra args — exactly what `<Input @enter>` did.
 *
 * Usage: <input value={{this.q}} {{on "input" (set-field this "q")}}
 *               {{on-enter (this.ctrlAction "search")}}>
 */
export default modifier(function onEnter(element, positional) {
  var handler = positional[0];
  if (typeof handler !== 'function') {
    return;
  }
  var listener = function(event) {
    if (event.key === 'Enter' || event.keyCode === 13) {
      handler(event);
    }
  };
  element.addEventListener('keydown', listener);
  return function() {
    element.removeEventListener('keydown', listener);
  };
});
