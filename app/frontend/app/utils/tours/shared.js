// Shared building blocks for the guided page tours (Shepherd-based). Each
// page/layout tour lives in its own module under utils/tours/ and composes
// these primitives so the visual language (eyebrow title, footer buttons) and
// the position-independent placement logic stay in ONE place.
import i18n from '../i18n';

// Which visual language a tour is dressed in. The four original tours run on the
// modern dashboard and use `md-tour__*`; the classic home page has its own glass
// surface and uses `ch-tour__*` (themed in _classic-home.scss). Passing the prefix
// rather than duplicating these builders keeps ONE definition of a tour's footer
// and eyebrow — the shape is identical, only the skin differs.
//
// Defaults to 'md' everywhere, so every existing caller is byte-for-byte unchanged.
function tourPrefix(opts) {
  return (opts && opts.classic) ? 'ch' : 'md';
}

// Standard Back/Next footer pair used on every interior step. The `type`
// (back/next) is intercepted by ember-shepherd's makeButton, which wires the
// navigation callback automatically.
function standardButtons(opts) {
  var p = tourPrefix(opts);
  return [
    {
      text: i18n.t('home_tour_back', "Back"),
      type: 'back',
      classes: p + '-tour__btn ' + p + '-tour__btn--ghost'
    },
    {
      text: i18n.t('home_tour_next', "Next"),
      type: 'next',
      classes: p + '-tour__btn ' + p + '-tour__btn--primary'
    }
  ];
}

// Decorated header HTML for the centered intro/outro steps: an "identity bar"
// eyebrow pill above the heading. Shepherd renders `title` via innerHTML, so an
// HTML string is the supported way to do this; every piece comes from i18n,
// never user input.
function decoratedTitle(headingKey, headingDefault, opts) {
  var p = tourPrefix(opts);
  var eyebrow = i18n.t('home_tour_eyebrow', "Guided Tour");
  var heading = i18n.t(headingKey, headingDefault);
  var spark = '<svg class="' + p + '-tour__eyebrow-icon" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l1.7 5.1 5.1 1.7-5.1 1.7L12 16.1l-1.7-5.1L5.2 9.3l5.1-1.7z"/><path d="M19 13.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" opacity="0.7"/></svg>';
  return '<span class="' + p + '-tour__eyebrow">' + spark +
         '<span class="' + p + '-tour__eyebrow-text">' + eyebrow + '</span></span>' +
         '<span class="' + p + '-tour__heading">' + heading + '</span>';
}

// Build a modern, scannable CHECKLIST body for a tour step instead of a prose
// paragraph (the pattern modern product tours — Intercom / Appcues / Stripe —
// use so users skim the value at a glance). `items` are pre-translated feature
// lines; optional `lead` renders a short framing line ABOVE the list, optional
// `foot` a closing line BELOW it. Returned as an HTML string — Shepherd sets it
// as the .shepherd-text innerHTML. All pieces come from i18n only, never user
// input. Styling: `.md-tour__list` / `.md-tour__li` / `.md-tour__lead` /
// `.md-tour__foot` in app.scss.
// `options.separator` (optional) is an HTML string inserted BETWEEN items —
// used to render an "OR" divider when the listed items are mutually-exclusive
// choices (the board-picker tour). Omitted everywhere else, so the default
// (run-on checklist) is unchanged.
function tourChecklist(items, lead, foot, options) {
  options = options || {};
  // `options.classic` skins the list for the classic home tour; every other caller
  // omits it and gets the modern classes unchanged.
  var p = tourPrefix(options);
  var check = '<svg class="' + p + '-tour__li-check" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  var lis = (items || []).map(function(t) {
    return '<li class="' + p + '-tour__li">' + check + '<span class="' + p + '-tour__li-text">' + t + '</span></li>';
  });
  var lisHtml = lis.join(options.separator || '');
  var leadHtml = lead ? ('<p class="' + p + '-tour__lead">' + lead + '</p>') : '';
  var footHtml = foot ? ('<p class="' + p + '-tour__foot">' + foot + '</p>') : '';
  return leadHtml + '<ul class="' + p + '-tour__list">' + lisHtml + '</ul>' + footHtml;
}

// A full-width action BUTTON rendered inside a step's body (not the footer), for
// steps that want a prominent in-body choice (e.g. the welcome step's "Skip tour
// for now" off-ramp). Shepherd sets `text` as innerHTML, so this returns an HTML
// string; the runner's per-step show hook (_onTourStepShow in guided-tour.js)
// wires the `data-tour-action` to the Tour. Supported actions: `show:<stepId>`,
// `next` (advance, same as the footer Next/Start button), `complete`, `cancel`.
// `text` comes from i18n only, never user input.
// `opts.classes` appends modifier classes; `opts.note` (i18n string) renders a
// smaller sub-line INSIDE the button beneath the label, so the helper text is
// clearly tied to clicking the button. A trailing "→" arrow (the same "go"
// affordance the home-page action buttons use) signals it's clickable.
function tourBodyButton(text, action, opts) {
  opts = opts || {};
  var cls = 'md-tour__body-btn' + (opts.classes ? ' ' + opts.classes : '');
  var label = '<span class="md-tour__body-btn-label">' + text + '</span>';
  var note = opts.note ? ('<span class="md-tour__body-btn-note">' + opts.note + '</span>') : '';
  var content = '<span class="md-tour__body-btn-content">' + label + note + '</span>';
  var arrow = '<span class="md-tour__body-btn-arrow" aria-hidden="true">&rarr;</span>';
  var btn = '<button type="button" class="' + cls + '" data-tour-action="' + action + '">' + content + arrow + '</button>';
  return '<div class="md-tour__body-action">' + btn + '</div>';
}

// Force the identity (account) dropdown open/closed for the tour. Sets the menu's
// display with `!important` (beating any stylesheet hide) AND toggles Bootstrap's
// `.open` on the `.dropdown` parent. The inline display is what keeps it open
// across the tour's Next clicks — Bootstrap's document-click handler strips
// `.open` but never touches inline styles. No-op when the dropdown isn't present
// (e.g. small screens, where the desktop menu is replaced by the hamburger).
function setIdentityDropdownOpen(open) {
  try {
    var btn = document.querySelector('#identity_button');
    var dd = btn && btn.closest('.dropdown');
    if (!dd) { return; }
    var menu = dd.querySelector('.dropdown-menu');
    if (menu) {
      if (open) { menu.style.setProperty('display', 'block', 'important'); }
      else { menu.style.removeProperty('display'); }
    }
    dd.classList.toggle('open', !!open);
  } catch (e) { /* never block the tour */ }
}

// First VISIBLE element matching `selector`. Cards turned off in the Dashboard
// Design modal are `display:none !important` but stay in the DOM, so a bare
// querySelector would still find them and Shepherd would spotlight a zero-size
// box (popover flies to a corner). `offsetParent === null` is true for any
// display:none ancestor, so this skips hidden cards AND picks the visible
// variant when a base class matches both a hidden and a shown element.
function visibleEl(selector) {
  var els = document.querySelectorAll(selector);
  for (var i = 0; i < els.length; i++) {
    if (els[i].offsetParent !== null) { return els[i]; }
  }
  return null;
}

// Modern "completion" animation for a tour's outro — a success checkmark that
// draws in with a pop + ring burst (replaces a plain "That's the tour!" line).
// Pure CSS (animations + reduced-motion guard in app.scss: `.md-tour__done*`).
// Shared across page tours so the celebratory outro is identical everywhere.
function doneCelebration() {
  return '' +
    '<div class="md-tour__done" aria-hidden="true">' +
      '<svg class="md-tour__done-svg" viewBox="0 0 52 52" width="62" height="62">' +
        '<circle class="md-tour__done-circle" cx="26" cy="26" r="24"></circle>' +
        '<path class="md-tour__done-mark" d="M16 27 l7 7 l13 -15"></path>' +
      '</svg>' +
    '</div>';
}

// Forward "next action" animation for a HANDOFF outro — an arrow that draws in
// and glides to the right (the counterpart to doneCelebration's checkmark) so a
// step that hands the user off to their NEXT step reads as "moving on", not
// "finished". Pure CSS (animations + reduced-motion guard in app.scss:
// `.md-tour__next*`). Shared so every handoff outro (home → board picker, board
// picker → live picker modal) renders the identical forward symbol. The step
// must also carry the `md-tour__step--next` class for the CSS to scope to it.
function nextAdvance() {
  return '' +
    '<div class="md-tour__next" aria-hidden="true">' +
      '<svg class="md-tour__next-svg" viewBox="0 0 52 52" width="62" height="62">' +
        '<circle class="md-tour__next-circle" cx="26" cy="26" r="24"></circle>' +
        '<path class="md-tour__next-arrow" d="M15 26 H34 M27 19 L34 26 L27 33"></path>' +
      '</svg>' +
    '</div>';
}

// First VISIBLE element matching `selector`, judged by its rendered BOX
// (getBoundingClientRect width/height), NOT offsetParent. This is the
// build-time-fragility-proof counterpart to visibleEl(): it works for
// position:fixed targets (offsetParent is null for those, so visibleEl() wrongly
// reports them hidden — the bug that centered the skip-handoff step) AND still
// skips display:none variants of a multi-markup selector (they measure 0×0). Use
// this — not a bare querySelector — anywhere a step's target is resolved at SHOW
// time so a hidden sibling is never grabbed. Returns null when nothing visible
// matches. Defensive against an invalid selector.
function visibleBySelector(selector) {
  var els;
  try { els = document.querySelectorAll(selector); } catch (e) { return null; }
  for (var i = 0; i < els.length; i++) {
    var r = els[i].getBoundingClientRect();
    if (r.width > 0 && r.height > 0) { return els[i]; }
  }
  return null;
}

// A Shepherd `attachTo.element` FUNCTION that re-resolves `selector` to the first
// visible match EVERY time the step shows. Shepherd v14 calls parseAttachTo on
// each _show() ("Force resolve to make sure the options are updated on subsequent
// shows"), so returning a function makes the spotlight resolve LIVE instead of
// binding a stale element captured when the step list was built. This is the core
// build-time-fragility fix: the step LIST is built once, but each target is found
// at the moment it's spotlighted — so a target that re-rendered (new node),
// shifted, or painted a beat late (common under deployment latency) is still
// highlighted, and the right on-screen variant is picked. Falls back to the
// build-time element if the live lookup finds nothing, so a step that DID resolve
// at build never regresses to a centered card.
function liveTarget(selector, fallbackEl) {
  return function() {
    return visibleBySelector(selector) || fallbackEl || null;
  };
}

// Return a Shepherd `beforeShowPromise` that WAITS (bounded) for `selector` to
// resolve to a VISIBLE, laid-out element before the step is positioned — so a
// target that paints a beat late (common under deployment latency, where the DOM
// isn't as instant as on a dev machine) is spotlighted instead of Shepherd
// falling back to a centered/mis-placed card. Pairs with liveTarget() (or a
// selector-string attachTo). Uses visibleBySelector (rendered box, not
// offsetParent) so it works for fixed-positioned and multi-variant targets alike.
// Never hangs: resolves as soon as the element is visible, or after ~1.5s
// regardless (20 × 75ms).
function waitForElement(selector) {
  return function() {
    return new Promise(function(resolve) {
      var tries = 0;
      var tick = function() {
        if (visibleBySelector(selector) || tries++ >= 20) { resolve(); return; }
        window.setTimeout(tick, 75);
      };
      tick();
    });
  };
}

// Placement for a card popover. Every card — full-width OR the smaller two-up
// action cards — shows its popover ABOVE the element, for one consistent read
// down the page (and so a side popover never runs off the right edge or sits
// awkwardly beside a small card). The nav PILLS are the deliberate exception:
// they sit at the very top of the page and are placed 'bottom' explicitly in
// pushNavSteps. Popper flips to 'bottom' automatically if there isn't room above
// (e.g. a card pinned to the very top). Takes no element — placement is uniform —
// but call sites still pass one for API symmetry with the resize handler.
function placementForElement() {
  return 'top';
}

// The scroll container the tour scrolls. The app's main pane is `#content`; while
// the tour runs we lock it to overflow:hidden (so the user can't scroll), but it
// stays programmatically scrollable — so detect it by scrollability, not by
// overflow. Prefer #content if it actually scrolls and contains the target; else
// walk up for any scrollable ancestor (overflow auto/scroll/hidden); else window.
function _tourScroller(el) {
  var content = document.getElementById('content');
  if (content && content.contains(el) && content.scrollHeight > content.clientHeight + 2) {
    return content;
  }
  var node = el && el.parentElement;
  while (node && node !== document.body && node !== document.documentElement) {
    var oy = window.getComputedStyle(node).overflowY;
    if ((oy === 'auto' || oy === 'scroll' || oy === 'hidden') && node.scrollHeight > node.clientHeight + 2) {
      return node;
    }
    node = node.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}

// GENTLY scroll a step's target into view and resolve when the scroll finishes.
// AAC-friendly: a slow, eased, custom animation (browser 'smooth' is too quick),
// so the user can comfortably FOLLOW the page to where the next highlight will be.
// Scrolling runs BEFORE the popover is positioned (it's an attached step's
// beforeShowPromise) so floating-ui places the card once, at the final spot — no
// flip-flash. `block` 'center' (default) or 'start' (tall targets, honoring the
// target's scroll-margin-top). `force` scrolls even if the target is already on
// screen. Respects prefers-reduced-motion (jumps instantly). Never hangs — it
// resolves after a fixed duration, or immediately when no scroll is needed.
function scrollIntoViewSettled(el, block, force) {
  return new Promise(function(resolve) {
    if (!el) { resolve(); return; }
    try {
      var scroller = _tourScroller(el);
      var isWin = (scroller === document.scrollingElement || scroller === document.documentElement || scroller === document.body);
      var sRect = isWin ? { top: 0, height: window.innerHeight || document.documentElement.clientHeight } : scroller.getBoundingClientRect();
      var startTop = isWin ? (window.scrollY || document.documentElement.scrollTop || 0) : scroller.scrollTop;
      var tRect = el.getBoundingClientRect();
      var relTop = tRect.top - sRect.top;
      var delta;
      if (block === 'start') {
        var margin = parseFloat(window.getComputedStyle(el).scrollMarginTop) || 0;
        delta = relTop - margin;
      } else {
        delta = relTop - (sRect.height - tRect.height) / 2;
      }
      var clientH = isWin ? sRect.height : scroller.clientHeight;
      var scrollH = isWin ? document.documentElement.scrollHeight : scroller.scrollHeight;
      var maxTop = Math.max(0, scrollH - clientH);
      var destTop = Math.max(0, Math.min(maxTop, startTop + delta));
      var diff = destTop - startTop;
      if (!force && Math.abs(diff) < 6) { resolve(); return; }   // already in view
      var setTop = isWin ? function(v) { window.scrollTo(0, v); } : function(v) { scroller.scrollTop = v; };
      var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) { setTop(destTop); resolve(); return; }        // accessibility: no animation
      // Eased scroll (~600ms easeInOutCubic): still gentle/visible, but quick
      // enough that the next card (which fades in once the scroll settles) starts
      // appearing promptly. The next card can't fade in DURING the scroll — while
      // floating-ui repositions it every frame the browser suppresses its
      // appearance until the target is fully in view — so a shorter scroll is what
      // makes the card show up sooner.
      var duration = 600, t0 = null;
      var tick = function(ts) {
        if (t0 === null) { t0 = ts; }
        var p = Math.min(1, (ts - t0) / duration);
        var eased = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        setTop(startTop + diff * eased);
        if (p < 1) { requestAnimationFrame(tick); } else { resolve(); }
      };
      requestAnimationFrame(tick);
    } catch (e) {
      try { el.scrollIntoView({ block: block || 'center' }); } catch (e2) { /* ignore */ }
      resolve();
    }
  });
}

export { standardButtons, decoratedTitle, tourChecklist, tourBodyButton, setIdentityDropdownOpen, visibleEl, visibleBySelector, liveTarget, waitForElement, placementForElement, doneCelebration, nextAdvance, scrollIntoViewSettled };
