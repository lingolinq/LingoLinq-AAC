// Classic home page guided tour — the walkthrough for `board_view_style == 'classic'`.
//
// WHY THIS EXISTS SEPARATELY FROM home.js
// The modern home tour (utils/tours/home.js) targets eight `.md-*` selectors —
// `.md-grid--dashboard`, `.md-pillnav`, `.md-display-style__trigger` and friends. NONE of
// them exists on the classic page, which renders `.ch-*` markup from
// components/dashboard/classic-view.hbs. Before this module existed the registry handed a
// classic user the modern builder, so "Take a tour" spotlit nothing at all.
//
// Like the other page tours this is DOM-DRIVEN and visibility-INDEPENDENT: every interior
// step resolves its target with visibleEl() and is SKIPPED when that element is not on
// screen. That is what keeps it correct across screen sizes and roles without a single
// media query here — a supporter has no Speak card, a user with no home board has no
// Home Board row, and those steps simply fall out.
//
// There is no gentle/focused axis here. That split belongs to the modern dashboard; the
// classic page has one layout, so this builder takes no `view` argument.
//
// Every string is a literal `i18n.t` key + English-default call so i18n_generator.rb's
// STATIC parser can extract it. User-facing defaults are DOUBLE-quoted; a single-quoted
// default is silently dropped by the generator.
import i18n from '../i18n';
import { standardButtons, decoratedTitle, tourChecklist, visibleEl, visibleBySelector, liveTarget, waitForElement } from './shared';

// Every helper is called with this so the popover, footer and checklist render in the
// classic glass language (`ch-tour__*`, themed in _classic-home.scss) rather than the
// modern `md-tour__*` skin. Passing it is what makes the shared builders reusable here
// instead of forking them.
var CLASSIC = { classic: true };

// i18n extraction no-op: the centered welcome/done steps build their heading via
// decoratedTitle('key', "Default"), and i18n_generator.rb's static scanner only
// recognises LITERAL `i18n.t` key + default calls — so those title keys would otherwise
// never reach the locale files. Listing them here as literal calls makes the generator
// extract + translate them. Never called at runtime. If you add another decoratedTitle()
// heading, add its literal here too.
// eslint-disable-next-line no-unused-vars
function _classic_home_tour_i18n_extractor_no_op() {
  i18n.t('classic_tour_welcome_title', "Welcome to your home page");
}

// Centered intro step (no attachTo) — frames what the page is for.
function welcomeStep() {
  return {
    id: 'classic_tour_welcome',
    title: decoratedTitle('classic_tour_welcome_title', "Welcome to your home page", CLASSIC),
    text: tourChecklist([
      i18n.t('classic_tour_welcome_b1', "Start talking in one tap"),
      i18n.t('classic_tour_welcome_b2', "See how communication is going"),
      i18n.t('classic_tour_welcome_b3', "Find every other tool in one place")
    ], i18n.t('classic_tour_welcome_lead', "A quick walk through the things you will use most."), null, CLASSIC),
    classes: 'ch-tour__step ch-tour__step--intro',
    buttons: [
      {
        text: i18n.t('home_tour_skip', "Skip tour"),
        type: 'cancel',
        classes: 'ch-tour__btn ch-tour__btn--ghost'
      },
      {
        text: i18n.t('home_tour_start', "Start the tour"),
        type: 'next',
        classes: 'ch-tour__btn ch-tour__btn--primary'
      }
    ]
  };
}

// The interior spotlights. REGIONS, NOT ITEMS (2026-10-09): this was six steps, one per
// control — account, setup rows, Speak, Reports, Extras, tabs. It now describes each MENU as a
// whole, which is both shorter and more durable: a step bound to `.ch-rail` keeps working when a
// row is added or a card is renamed, where `.ch-tile--speak-main` did not.
//
//   `sel`    — target selector (first VISIBLE match wins)
//   `on`     — popover placement; floating-ui flips automatically if there is no room
//   `padded` — region targets that want a roomy rounded cutout rather than a tight hug
//   `last`   — ends the tour from this step instead of a separate outro
function interiorSteps() {
  return [
    {
      // The whole rail: identity block AND the setup rows under it, which used to be two
      // separate steps hugging `.ch-rail__identity` and `.ch-rail__list`.
      id: 'classic_tour_rail',
      sel: '.ch-rail',
      on: 'right',
      padded: true,
      title: i18n.t('classic_tour_rail_title', "Your side menu"),
      text: tourChecklist([
        i18n.t('classic_tour_rail_b1', "Who you are signed in as, and your account settings"),
        i18n.t('classic_tour_rail_b2', "Your home board, your supporters and logging"),
        i18n.t('classic_tour_rail_b3', "It stays in the same place on every screen")
      ], null, null, CLASSIC)
    },
    {
      // The Actions / Boards / Updates strip.
      id: 'classic_tour_tabs',
      sel: '.ch-tabs',
      on: 'bottom',
      padded: true,
      title: i18n.t('classic_tour_tabs_title', "Switch between views"),
      text: tourChecklist([
        i18n.t('classic_tour_tabs_b1', "Actions is what you see now"),
        i18n.t('classic_tour_tabs_b2', "Boards browses and finds boards"),
        i18n.t('classic_tour_tabs_b3', "Updates has notifications and recent sessions")
      ], null, null, CLASSIC)
    },
    {
      // The whole Actions row, replacing the separate Speak / Reports / Extras steps.
      // `:not(.ch-grid--extras)` so an open Extras drawer does not win the match — both
      // carry `.ch-grid`, and the drawer is the later element in the DOM.
      id: 'classic_tour_cards',
      sel: '.ch-grid:not(.ch-grid--extras)',
      tab: 'main',
      on: 'top',
      padded: true,
      last: true,
      title: i18n.t('classic_tour_cards_title', "Your main actions"),
      text: tourChecklist([
        i18n.t('classic_tour_cards_b1', "Speak opens your board ready to talk"),
        i18n.t('classic_tour_cards_b2', "Reports shows how communication is going"),
        i18n.t('classic_tour_cards_b3', "Extras opens the rest of your tools")
      ], i18n.t('classic_tour_cards_lead', "You can take this tour again any time from the side menu."), null, CLASSIC)
    }
  ];
}

/* THE TOUR IS OF THE ACTIONS TAB (2026-10-02, adversarial review). Its Speak, Reports and Extras
   steps live on that tab, and the tabs step says "Actions is what you see now". Started on another
   tab, those tiles were not rendered, so their steps were dropped (and Reports matched a
   communicator card's link). So the first interior step switches to Actions through the tab's own
   button (`data-tour-tab="main"`, classic-view.hbs), and an Actions-tab step is kept at build time
   whenever that tab exists, then skipped at show time (`showOn`) if its tile is not there -- which
   still drops Speak for a supporter, whose Actions tab has no Speak card. */
var ACTIONS_TAB = '.ch-tabs [data-tour-tab="main"]';
function showActionsTab() {
  var tab = document.querySelector(ACTIONS_TAB);
  if (tab && !tab.classList.contains('is-active')) { tab.click(); }
}

function pushInteriorSteps(steps) {
  var first = true;
  interiorSteps().forEach(function(cfg) {
    var el = visibleEl(cfg.sel);
    var later = !el && cfg.tab === 'main' && !!document.querySelector(ACTIONS_TAB);
    if (!el && !later) { return; }
    var wait = waitForElement(cfg.sel);
    var step = {
      id: cfg.id,
      // Resolve the target LIVE at show time so a control that re-rendered, shifted, or
      // painted a beat late (common under deployment latency, where the DOM is not as
      // instant as on a dev machine) is still spotlighted.
      attachTo: { element: liveTarget(cfg.sel, el), on: cfg.on },
      beforeShowPromise: first ? function() { showActionsTab(); return wait(); } : wait,
      title: cfg.title,
      text: cfg.text,
      classes: 'ch-tour__step' + (cfg.cls ? ' ' + cfg.cls : ''),
      // The final step ends the tour itself, so there is no separate outro screen.
      //
      // An ACTION, not `type: 'complete'`: ember-shepherd's makeButton accepts only
      // back/cancel/next as types and ASSERTS otherwise, which in a development build once
      // stopped this whole tour from starting. Carried over from the outro step this replaces.
      buttons: cfg.last ? [
        standardButtons(CLASSIC)[0],
        {
          text: i18n.t('home_tour_done', "Got it"),
          action: function() { return this.complete(); },
          classes: 'ch-tour__btn ch-tour__btn--primary'
        }
      ] : standardButtons(CLASSIC)
    };
    // Force a scroll for every step so placement is consistent, rather than the runner's
    // "already visible? skip" fast-path, which would let floating-ui flip the popover.
    step.scrollBlock = cfg.block || 'center';
    if (cfg.padded) {
      step.modalOverlayOpeningPadding = 12;
      step.modalOverlayOpeningRadius = 18;
      step.matchTargetRadius = false;
    }
    if (cfg.tab) { step.showOn = function() { return !!visibleBySelector(cfg.sel); }; }
    first = false;
    steps.push(step);
  });
}

// `options` is accepted for signature parity with the other builders (the registry's
// thunk forwards caller options through); this tour has no handoff, so nothing reads it
// yet. Kept so adding one later does not change every call site.
// eslint-disable-next-line no-unused-vars
function buildClassicHomeSteps(options) {
  var steps = [];
  steps.push(welcomeStep());
  pushInteriorSteps(steps);
  return steps;
}

export { buildClassicHomeSteps };
export default buildClassicHomeSteps;
