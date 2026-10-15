/**
 * Fire the "select" activation on an element as a NATIVE event (2026-10-13).
 *
 * Basic's sentence bar listens with `{{on "select" (this.ctrlAction "vocalize")}}`
 * (templates/application.hbs, brief.hbs), a native listener. jQuery's `.trigger('select')` and
 * `.select()` reach only jQuery handlers and a native method of that name, and an <a> has none, so a
 * tap, Enter or a switch-scanning select never spoke the message. A native event also reaches any
 * jQuery handler, since jQuery binds with addEventListener. Bubbles, as jQuery's trigger did.
 * Accepts a DOM element or a jQuery wrapper.
 */
export function fire_select(elem) {
  var el = elem && elem.jquery ? elem[0] : elem;
  if (!el || !el.dispatchEvent) { return; }
  el.dispatchEvent(new Event('select', { bubbles: true, cancelable: true }));
}
