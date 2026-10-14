import { modifier } from 'ember-modifier';

/**
 * Swaps a `.ch-tabs` strip for its `.ch-tabselect` dropdown while the strip does not fit.
 *
 * WHY A MEASUREMENT AND NOT A BREAKPOINT (2026-10-02, requested: "when [the left menu]
 * expands, we need the menu on the right to convert to a dropdown"). Whether the tabs fit
 * depends on the width the page gives them, which the Basic rail changes when it expands, and on
 * the labels, which the language changes ("Communicators" is one of the shorter translations). A
 * viewport breakpoint can only guess at both; this asks the strip itself.
 *
 * HOW. Adds `is-squeezed` to the element while the strip's content is wider than its box
 * (`scrollWidth > clientWidth`); _classic-home.scss then hides the strip and shows the dropdown.
 * The squeezed strip is hidden with `visibility`, not `display: none`, and kept at the same width
 * (positioned over the full width of this element), so it can still be measured and the dropdown
 * gives way to it as soon as there is room again. Re-checked whenever this element or the strip
 * resizes, which covers the rail toggling, the window resizing and the labels changing.
 *
 * At <=550px the strip is `display: none` (_classic-home.scss, the home tabs' rule), measures 0,
 * and is never marked; the dropdown shows there through that same rule.
 *
 * Usage: <div {{fit-or-select}}><nav class="ch-tabs">…</nav><select class="ch-tabselect">…</select></div>
 */
export default modifier(function fitOrSelect(element) {
  var check = function() {
    var strip = element.querySelector('.ch-tabs');
    var squeezed = !!strip && strip.scrollWidth > strip.clientWidth + 1;
    element.classList.toggle('is-squeezed', squeezed);
  };
  check();
  if (typeof ResizeObserver === 'undefined') { return; }
  var observer = new ResizeObserver(check);
  observer.observe(element);
  var strip = element.querySelector('.ch-tabs');
  if (strip) { observer.observe(strip); }
  return function() { observer.disconnect(); };
});
