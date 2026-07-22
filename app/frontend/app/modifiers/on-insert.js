import { modifier } from 'ember-modifier';

/**
 * Calls the given function once, when the element is first inserted. Replaces
 * a classic component's `didInsertElement` for the common "run a callback on
 * insert" case (e.g. board-canvas kicking off its first redraw).
 *
 * Usage: <canvas ...attributes {{on-insert @onInsert}}></canvas>
 * The callback is invoked with no arguments, matching the classic behavior.
 */
export default modifier(function onInsert(element, positional) {
  var callback = positional[0];
  if (typeof callback === 'function') {
    callback();
  }
});
