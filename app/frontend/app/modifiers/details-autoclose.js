import { modifier } from 'ember-modifier';

/**
 * Closes a native `<details>` menu when the person finishes with it: when they pick something
 * inside it, when they click away, or when they press Escape.
 *
 * WHY THIS IS NEEDED AT ALL. `<details>` gives the toggle, the keyboard handling and the
 * expanded state to assistive tech for free, which is why it is used here in preference to a
 * div-and-ARIA menu. What it does NOT do is dismiss itself: `open` is DOM state, so a menu left
 * open stays open — including ACROSS A ROUTE TRANSITION, because choosing an option here only
 * swaps the parent route's model and Ember reuses the same element rather than tearing it down.
 * Without this the org switcher stayed hanging open over the page it had just navigated to.
 *
 * The document listener is registered in the CAPTURE phase so it still runs when something
 * inside stops propagation, and it is removed on teardown — a menu that outlives its element
 * would keep a closure over a destroyed DOM node.
 *
 * Usage: <details {{details-autoclose}}> … </details>
 */
export default modifier(function detailsAutoclose(element) {
  var closeIfOutside = function(event) {
    if (!element.open) { return; }
    if (event.target && element.contains(event.target)) { return; }
    element.open = false;
  };

  var closeOnChoice = function(event) {
    /* Anything that navigates or acts closes the menu. `closest` rather than a direct target
       check because the click usually lands on a label span inside the link. */
    var actionable = event.target && event.target.closest &&
                     event.target.closest('a, button, [role="menuitem"]');
    if (actionable && element.contains(actionable)) {
      element.open = false;
    }
  };

  var closeOnEscape = function(event) {
    if (event.key === 'Escape' && element.open) {
      element.open = false;
      /* Focus returns to the summary, so Escape does not strand a keyboard user at the top of
         the document with no indication of where they were. */
      var summary = element.querySelector('summary');
      if (summary) { try { summary.focus(); } catch (e) { /* not focusable */ } }
    }
  };

  document.addEventListener('click', closeIfOutside, true);
  element.addEventListener('click', closeOnChoice);
  element.addEventListener('keydown', closeOnEscape);

  return function() {
    document.removeEventListener('click', closeIfOutside, true);
    element.removeEventListener('click', closeOnChoice);
    element.removeEventListener('keydown', closeOnEscape);
  };
});
