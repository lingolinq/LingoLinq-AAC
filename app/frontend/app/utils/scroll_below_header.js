/**
 * Scroll an element to the TOP of the viewport, clear of the app's fixed header.
 *
 * Extracted from controllers/caseload.js, where it was written for the communicator
 * accordion, when the classic home page's Extras drawer needed the identical behaviour.
 * The comments below are the reasons that implementation ended up the shape it is; they
 * are kept here so the next caller inherits them instead of rediscovering them.
 *
 * WHY `block: 'start'` AND NOT `'nearest'`
 * 'nearest' scrolls the MINIMUM distance, so an element whose bottom sits below the fold
 * gets its BOTTOM pulled to the viewport bottom — leaving whatever was above it still
 * occupying the top of the screen, which reads as "it scrolled to the wrong place".
 * 'start' puts the element's own top edge at the top every time.
 *
 * WHY THE HEADER IS MEASURED AND NOT TAKEN FROM A TOKEN
 * `--topbar-height` resolves to 16px on authenticated layouts (app.scss ~367) while the
 * bar those layouts actually render is ~88px, so trusting it scrolls the element up
 * UNDER the header and clips it. Measuring also survives the bar changing height between
 * layouts — 16 / 68 / 70 / 129px are all live values in this app — and when it wraps.
 *
 * WHY IT WRITES `scroll-margin-top` INSTEAD OF DOING THE ARITHMETIC
 * So this keeps working whether the scroll container is the window or an ancestor
 * element. `#within_ember` is fixed with `overflow: hidden` on some routes
 * (templates/application.hbs:1504), and subtracting an offset from a window scroll
 * position would be wrong in exactly those cases.
 *
 * Best-effort throughout: a failure here must never block the interaction that asked
 * for the scroll.
 *
 * @param {Element} el     the element to bring to the top
 * @param {Object}  [opts] `gap` — px of breathing room below the header (default 12)
 * @return {boolean} whether a scroll was actually issued
 */
export default function scrollBelowHeader(el, opts) {
  try {
    if (!el || typeof el.scrollIntoView !== 'function') { return false; }
    var gap = (opts && typeof opts.gap === 'number') ? opts.gap : 12;

    var offset = 0;
    var header = document.querySelector('#within_ember > header') || document.querySelector('body > header');
    if (header && typeof window.getComputedStyle === 'function') {
      var pos = window.getComputedStyle(header).position;
      if (pos === 'fixed' || pos === 'sticky') {
        offset = header.getBoundingClientRect().height || 0;
      }
    }
    if (offset > 0 && el.style) {
      el.style.scrollMarginTop = (offset + gap) + 'px';
    }

    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start', inline: 'nearest' });
    return true;
  } catch (e) {
    return false;
  }
}
