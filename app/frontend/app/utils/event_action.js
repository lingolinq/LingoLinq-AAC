/**
 * Builds an `{{on}}`-ready action wrapper that FORWARDS the raw DOM event.
 *
 * The generic `ctrlAction` wrapper introduced with the Ember 5.12 upgrade
 * (#490) calls `preventDefault()` on every event and then pops it off the
 * argument list before `send()`. That is correct for a plain `click` on a
 * `<button>`, but it silently breaks any handler that needs the event:
 *
 *   - `keydown`  -> `event.key` is undefined AND preventDefault suppresses
 *                   character insertion, so the field cannot be typed in
 *   - `input`    -> `event.target.value` is undefined, so the model never
 *                   receives what the user typed
 *   - `paste`    -> `event.clipboardData` is undefined
 *   - drag/drop  -> `event.dataTransfer` is undefined, and preventDefault on
 *                   `dragstart` cancels the drag outright
 *
 * This wrapper restores the semantics of the pre-5.12 element-space form
 * (`onkeydown={{action "handleKeydown"}}`): the event is passed through
 * untouched and the ACTION decides whether to preventDefault/stopPropagation.
 * Handlers written against that contract (which is all of them — they already
 * call `event.preventDefault()` themselves where they mean to) then work as
 * originally authored.
 *
 * Use for: keydown, keyup, input, change, paste, and drag/drop events.
 * Keep using `ctrlAction` for `click` and `submit`, where swallowing the event
 * is the intended behavior.
 *
 * Usage, in a classic component/controller `init`:
 *   this.eventAction = buildEventAction(this);
 * then in the template:
 *   {{on "keydown" (this.eventAction "handleKeydown")}}
 *   {{on "drop"    (this.eventAction "cellDrop" rowIdx colIdx)}}
 *
 * Bound arguments come first, the event last — matching the existing
 * `actions: { cellDrop(row, col, event) {...} }` signatures.
 *
 * `target` is normally the component/controller itself, but may also be a
 * function returning the dispatch target, for components that forward their
 * actions to another object (e.g. available-boards-section -> boardsCtrl).
 * Resolving it lazily also means a target that isn't set at init still works.
 */
export default function buildEventAction(target) {
  return function(actionName) {
    var bound = Array.prototype.slice.call(arguments, 1);
    return function() {
      var args = bound.concat(Array.prototype.slice.call(arguments));
      var dest = (typeof target === 'function') ? target() : target;
      if (dest && dest.send) { dest.send.apply(dest, [actionName].concat(args)); }
    };
  };
}
