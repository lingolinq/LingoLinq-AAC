import { modifier } from 'ember-modifier';

/**
 * On image load error, swap the element's `src` to the URL held in its `rel`
 * attribute (a bundled fallback image). Replaces the inline
 * `onerror="this.src=this.getAttribute('rel');"` pattern with a CSP-safe modifier.
 *
 * The swap runs at most once, so a missing/broken fallback can't loop — the inline
 * version could re-fire indefinitely if the fallback also failed. In every real case
 * (the fallback is a bundled asset that always loads) the observable result is identical.
 */
export default modifier(function imageFallbackToRel(element) {
  var swapped = false;
  var handler = function() {
    var fallback = element.getAttribute('rel');
    if (fallback && !swapped) {
      swapped = true;
      element.src = fallback;
    }
  };
  element.addEventListener('error', handler);
  return function() { element.removeEventListener('error', handler); };
});
