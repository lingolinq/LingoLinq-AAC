import { modifier } from 'ember-modifier';

/**
 * On image load error, hide the element. Replaces the inline
 * `onerror="this.style.visibility='hidden';"` / `"this.style.display='none';"` patterns
 * with a CSP-safe modifier.
 *
 * Default hides via `visibility: hidden` (keeps the element's layout box, matching the
 * inline visibility variant). Pass `"display"` to hide via `display: none` (removes the box),
 * matching the inline display variant.
 */
export default modifier(function hideOnError(element, positional) {
  var mode = positional[0];
  var handler = function() {
    if (mode === 'display') {
      element.style.display = 'none';
    } else {
      element.style.visibility = 'hidden';
    }
  };
  element.addEventListener('error', handler);
  return function() { element.removeEventListener('error', handler); };
});
