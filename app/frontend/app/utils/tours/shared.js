// Shared building blocks for the guided page tours (Shepherd-based). Each
// page/layout tour lives in its own module under utils/tours/ and composes
// these primitives so the visual language (eyebrow title, footer buttons) and
// the position-independent placement logic stay in ONE place.
import i18n from '../i18n';

// Standard Back/Next footer pair used on every interior step. The `type`
// (back/next) is intercepted by ember-shepherd's makeButton, which wires the
// navigation callback automatically.
function standardButtons() {
  return [
    {
      text: i18n.t('home_tour_back', "Back"),
      type: 'back',
      classes: 'md-tour__btn md-tour__btn--ghost'
    },
    {
      text: i18n.t('home_tour_next', "Next"),
      type: 'next',
      classes: 'md-tour__btn md-tour__btn--primary'
    }
  ];
}

// Decorated header HTML for the centered intro/outro steps: an "identity bar"
// eyebrow pill above the heading. Shepherd renders `title` via innerHTML, so an
// HTML string is the supported way to do this; every piece comes from i18n,
// never user input.
function decoratedTitle(headingKey, headingDefault) {
  var eyebrow = i18n.t('home_tour_eyebrow', "Guided Tour");
  var heading = i18n.t(headingKey, headingDefault);
  var spark = '<svg class="md-tour__eyebrow-icon" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l1.7 5.1 5.1 1.7-5.1 1.7L12 16.1l-1.7-5.1L5.2 9.3l5.1-1.7z"/><path d="M19 13.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" opacity="0.7"/></svg>';
  return '<span class="md-tour__eyebrow">' + spark +
         '<span class="md-tour__eyebrow-text">' + eyebrow + '</span></span>' +
         '<span class="md-tour__heading">' + heading + '</span>';
}

// Build a modern, scannable CHECKLIST body for a tour step instead of a prose
// paragraph (the pattern modern product tours — Intercom / Appcues / Stripe —
// use so users skim the value at a glance). `items` are pre-translated feature
// lines; optional `lead` renders a short framing line ABOVE the list, optional
// `foot` a closing line BELOW it. Returned as an HTML string — Shepherd sets it
// as the .shepherd-text innerHTML. All pieces come from i18n only, never user
// input. Styling: `.md-tour__list` / `.md-tour__li` / `.md-tour__lead` /
// `.md-tour__foot` in app.scss.
function tourChecklist(items, lead, foot) {
  var check = '<svg class="md-tour__li-check" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  var lis = (items || []).map(function(t) {
    return '<li class="md-tour__li">' + check + '<span class="md-tour__li-text">' + t + '</span></li>';
  }).join('');
  var leadHtml = lead ? ('<p class="md-tour__lead">' + lead + '</p>') : '';
  var footHtml = foot ? ('<p class="md-tour__foot">' + foot + '</p>') : '';
  return leadHtml + '<ul class="md-tour__list">' + lis + '</ul>' + footHtml;
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

export { standardButtons, decoratedTitle, tourChecklist, setIdentityDropdownOpen, visibleEl, placementForElement };
