// Board-picker page guided tour — walks a user through creating or picking their
// first communication board (page-set) on the standalone `/board-picker` page.
//
// Like the home tour, this is DOM-driven and visibility-INDEPENDENT: every
// interior step resolves its target with visibleEl() and is SKIPPED when that
// element isn't on screen, so the tour stays correct across the page's category
// states (e.g. the "Mine" category renders no search form). It serves
// BOTH dashboard layouts from one builder — `layout` only tags
// each step so the popover picks up the Focused-View skin; structure is the same.
//
// Adding/booking copy: every string is a literal `i18n.t` key + English-default call
// so i18n_generator.rb's STATIC parser can extract it (see LEARNINGS.md on the
// static-parser gotcha — bound/dynamic keys are invisible to it).
import i18n from '../i18n';
import modal from '../modal';
import { standardButtons, decoratedTitle, tourChecklist, visibleEl, liveTarget, waitForElement, nextAdvance } from './shared';

// NOTE: "smooth scroll, then show" is applied by the guided-tour RUNNER
// (_applySmoothScroll) to every attached step of every tour — steps just declare
// an optional `scrollBlock` hint (below). The shared scroll-settle helper lives
// in utils/tours/shared.js.

// i18n extraction no-op: the two centered steps build their heading through
// decoratedTitle('key', "Default"), and i18n_generator.rb's static scanner only
// recognises LITERAL `i18n.t` key + default calls — so those title keys are
// invisible to it and would never reach the locale files (see LEARNINGS.md on the
// static-parser gotcha). Listing them here as literal i18n.t calls makes the
// generator extract + translate them. Never called at runtime. If you add another
// decoratedTitle() heading, add its literal here too.
// eslint-disable-next-line no-unused-vars
function _board_picker_tour_i18n_extractor_no_op() {
  i18n.t('board_picker_tour_welcome_title', "Pick your communication board");
  i18n.t('board_picker_tour_done_title', "You're ready to pick a board");
}

// A visual "OR" divider rendered BETWEEN the three option checklist items so
// they read as mutually-exclusive choices (pick one of the three). aria-hidden
// — the three checklist items already stand as distinct options for screen
// readers, and an "OR" list item would just add noise. Flanking rules are drawn
// in CSS (.md-tour__or). Literal i18n.t so the static generator extracts it.
function orSeparator() {
  return '<li class="md-tour__or" aria-hidden="true"><span class="md-tour__or-text md-hero__gradient-text">' +
    i18n.t('board_picker_tour_or', "OR") + '</span></li>';
}

// Centered intro step (no attachTo) — frames what this page is for.
function welcomeStep() {
  return {
    id: 'board_picker_tour_welcome',
    title: decoratedTitle('board_picker_tour_welcome_title', "Pick your communication board"),
    text: tourChecklist([
      i18n.t('board_picker_tour_welcome_b1', "Let us choose a starter board for you"),
      i18n.t('board_picker_tour_welcome_b2', "Build your own from scratch"),
      i18n.t('board_picker_tour_welcome_b3', "Browse and preview ready-made boards")
    ], i18n.t('board_picker_tour_welcome_lead', "This is where you choose the board (page-set) your communicator will talk with."), null, { separator: orSeparator() }),
    classes: 'md-tour__step md-tour__step--intro md-tour__step--welcome',
    buttons: [
      {
        text: i18n.t('home_tour_skip', "Skip tour"),
        type: 'cancel',
        classes: 'md-tour__btn md-tour__btn--ghost'
      },
      {
        text: i18n.t('home_tour_start', "Start the tour"),
        type: 'next',
        classes: 'md-tour__btn md-tour__btn--primary'
      }
    ]
  };
}

// The interior spotlights, in reading order down the page. Each entry resolves
// its target from the live DOM and is skipped when absent. `on` is the popover
// placement (Popper flips automatically if there isn't room). The two CTAs and
// the category tabs sit near the top, so their popovers read 'bottom'; the board
// grid and search sit lower, so theirs read 'top'.
function interiorSteps() {
  return [
    {
      id: 'board_picker_tour_assign',
      sel: '.board-picker-page__assign-btn',
      on: 'bottom',
      // Nudged down 10rem (the assign button sits near the bottom, so this popover
      // flips ABOVE it and rode too high) — see .md-tour__step--bp-assign in app.scss.
      cls: 'md-tour__step--bp-assign',
      title: i18n.t('board_picker_tour_assign_title', "Let us pick for you"),
      text: tourChecklist([
        i18n.t('board_picker_tour_assign_b1', "We choose a great starter home board"),
        i18n.t('board_picker_tour_assign_b2', "Set up and ready to use right away"),
        i18n.t('board_picker_tour_assign_b3', "You can change it anytime")
      ])
    },
    {
      id: 'board_picker_tour_new',
      sel: '.board-picker-page__new-btn',
      on: 'bottom',
      title: i18n.t('board_picker_tour_new_title', "Create your own board"),
      text: tourChecklist([
        i18n.t('board_picker_tour_new_b1', "Start from a blank board"),
        i18n.t('board_picker_tour_new_b2', "Add and arrange your own buttons"),
        i18n.t('board_picker_tour_new_b3', "Make it truly yours")
      ])
    },
    {
      id: 'board_picker_tour_tabs',
      sel: '.md-home-boards-picker__nav',
      on: 'bottom',
      // Container-type target (a square-cornered region, not a single rounded
      // control) — use a stylized padded + rounded cutout instead of the tight
      // shape-matched square (see pushInteriorSteps / `padded`).
      padded: true,
      title: i18n.t('board_picker_tour_tabs_title', "Browse by category"),
      text: tourChecklist([
        i18n.t('board_picker_tour_tabs_b1', "Robust vocabularies for everyday talk"),
        i18n.t('board_picker_tour_tabs_b2', "Simple starts and functional boards"),
        i18n.t('board_picker_tour_tabs_b3', "Keyboards and more")
      ])
    },
    {
      // FIRST board card — explain what a board option IS. The popover sits
      // BELOW the card (consistent with every other interior step — the card
      // always reads directly under the spotlight, so the tour moves smoothly
      // DOWN the page instead of jumping side to side). The card (~278px) is too
      // tall to fit a below-popover when centered, so this step scrolls it to the
      // TOP (`block: 'start'`) which leaves room below. Padded rounded cutout.
      id: 'board_picker_tour_card',
      sel: '.md-home-boards-picker__board',
      on: 'bottom',
      block: 'start',
      padded: true,
      title: i18n.t('board_picker_tour_card_title', "Browse your board options"),
      text: tourChecklist([
        i18n.t('board_picker_tour_card_b1', "Each card is a ready-made board"),
        i18n.t('board_picker_tour_card_b2', "Check its name and grid size"),
        i18n.t('board_picker_tour_card_b3', "There's no wrong choice")
      ])
    },
    {
      // ...then zoom in on THAT card's "Preview" pill, popover BELOW it (same
      // consistent placement). Reuses the historically-named grid_* copy keys.
      id: 'board_picker_tour_grid',
      sel: '.md-home-boards-picker__board .info',
      on: 'bottom',
      title: i18n.t('board_picker_tour_grid_title', "Preview board options"),
      text: tourChecklist([
        i18n.t('board_picker_tour_grid_b1', "Tap any board to preview it"),
        i18n.t('board_picker_tour_grid_b2', "See how its buttons are laid out"),
        i18n.t('board_picker_tour_grid_b3', "Pick the one that fits today")
      ])
    },
    {
      id: 'board_picker_tour_search',
      sel: '.md-home-boards-picker__search',
      on: 'top',
      padded: true,
      title: i18n.t('board_picker_tour_search_title', "Search for more boards"),
      text: tourChecklist([
        i18n.t('board_picker_tour_search_b1', "Search public boards by name"),
        i18n.t('board_picker_tour_search_b2', "Find a specific style or layout"),
        i18n.t('board_picker_tour_search_b3', "Explore the full catalog")
      ])
    }
  ];
}

// Push one step per VISIBLE interior target, attaching to the RESOLVED element
// (not the selector string) so Shepherd can't grab a hidden sibling — mirrors the
// home tour's defensiveness. Absent targets are skipped, so the tour adapts to
// whichever category state is on screen.
function pushInteriorSteps(steps) {
  interiorSteps().forEach(function(cfg) {
    var el = visibleEl(cfg.sel);
    if (!el) { return; }
    // `block:'start'` aligns the target's top with the scroll-port top, which is
    // BEHIND the fixed navbar — the target's top tucks under it. scroll-margin-top
    // makes scrollIntoView stop that many px early, landing the target just below
    // the navbar (measured live so it's correct at any header height). Benign and
    // tour-only (only matters for scrollIntoView, which only the tour calls here).
    if (cfg.block === 'start') {
      var nav = document.querySelector('#inner_header') || document.querySelector('.app-navbar-authenticated-inner');
      var navH = nav ? Math.ceil(nav.getBoundingClientRect().bottom) : 64;
      el.style.scrollMarginTop = (navH + 18) + 'px';
    }
    var step = {
      id: cfg.id,
      // Resolve the target LIVE at show time + WAIT (bounded) for it before
      // positioning, so a target that re-rendered or painted late (category
      // switch, deployment latency) is still spotlighted. visibleEl() above still
      // gates/orders the step against the current category state.
      attachTo: { element: liveTarget(cfg.sel, el), on: cfg.on },
      beforeShowPromise: waitForElement(cfg.sel),
      // The runner smooth-scrolls each target into view before showing (uniform
      // 'bottom' placement → popover always reads directly under the spotlight,
      // no flip-flash). `scrollBlock` forces the scroll position for the tall card
      // ('start', so its below-popover fits); other steps omit it (center, and
      // skipped entirely when already on-screen).
      title: cfg.title,
      text: cfg.text,
      classes: 'md-tour__step' + (cfg.cls ? ' ' + cfg.cls : ''),
      buttons: standardButtons()
    };
    // Always set scrollBlock so the runner FORCES a center-scroll for every
    // step (rather than its "already visible? skip" fast-path). This tour wants
    // uniform 'bottom' placement, which only fits when the target is scrolled to
    // give room below — skipping the scroll on an already-visible target would let
    // floating-ui flip it to 'top'. ('start' for the tall card so its
    // below-popover fits; 'center' for everything else.)
    step.scrollBlock = cfg.block || 'center';
    // `padded` targets are square-cornered REGIONS (tabs row, board grid, search
    // form) — give them a roomy, rounded cutout instead of the tight square the
    // default shape-match produces. matchTargetRadius:false tells guided-tour.js
    // NOT to snap the radius back to the element's own 0px corners (mirrors the
    // home tour's chrome steps).
    if (cfg.padded) {
      step.modalOverlayOpeningPadding = 12;
      step.modalOverlayOpeningRadius = 18;
      step.matchTargetRadius = false;
    }
    steps.push(step);
  });
}

// Centered outro — the recap, then a "Pick your Board" button that completes the
// tour and opens the LIVE board-picker modal (the final, almost full-screen
// "card") so the user can actually assign / create / pick. Completing first tears
// down the Shepherd overlay before the app modal opens (two body-level overlays
// would otherwise collide). This step HANDS OFF (to the picker modal), so it uses
// the forward "next" arrow animation — not the done checkmark, which would imply
// the user is finished — matching the home tour's handoff outro. The
// `md-tour__step--next` class scopes the arrow's CSS to this step.
function doneStep() {
  return {
    id: 'board_picker_tour_done',
    title: decoratedTitle('board_picker_tour_done_title', "You're ready to pick a board"),
    text: nextAdvance() + tourChecklist([
      i18n.t('board_picker_tour_welcome_b1', "Let us choose a starter board for you"),
      i18n.t('board_picker_tour_welcome_b2', "Build your own from scratch"),
      i18n.t('board_picker_tour_welcome_b3', "Browse and preview ready-made boards")
    ], null,
      i18n.t('board_picker_tour_done_text', "You can return to this tour anytime from the Take a tour button at the top."),
      { separator: orSeparator() }),
    classes: 'md-tour__step md-tour__step--intro md-tour__step--outro md-tour__step--next',
    buttons: [
      {
        text: i18n.t('board_picker_tour_pick_my_board', "Pick your Board"),
        classes: 'md-tour__btn md-tour__btn--primary',
        action: function() {
          this.complete();
          modal.open('tour-board-picker', {});
        }
      }
    ]
  };
}

// Build the full ordered step list for the board-picker page. `layout` is
// 'gentle' or 'focused' (defaults to 'gentle') and only tags each step so the
// popover picks up the Focused-View skin — structure is discovered from the live
// DOM, so it's correct regardless. `options` is accepted for API symmetry with
// the home builder (handoff/menu); this page is the destination of those flows,
// so there's no further handoff and it always builds the linear walkthrough.
function buildBoardPickerSteps(layout, options) {
  options = options || {};
  var steps = [];
  steps.push(welcomeStep());
  pushInteriorSteps(steps);
  steps.push(doneStep());
  if (layout === 'focused') {
    steps.forEach(function(s) {
      s.classes = ((s.classes || '') + ' md-tour__step--focused').trim();
    });
  }
  return steps;
}

export { buildBoardPickerSteps };
export default buildBoardPickerSteps;
