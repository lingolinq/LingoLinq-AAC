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
import { communicatorWelcomeStep } from './home';

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

// Centered intro step (no attachTo). A supporter's (an SLP's) tour; a communicator gets the shared
// welcome card instead (buildClassicHomeSteps).
function welcomeStep() {
  return {
    id: 'classic_tour_welcome',
    title: decoratedTitle('classic_tour_welcome_title', "Welcome to your home page", CLASSIC),
    text: tourChecklist([
      i18n.t('classic_tour_slp_welcome_b1', "Your boards"),
      i18n.t('classic_tour_slp_welcome_b2', "Your caseload, and modeling on their boards"),
      i18n.t('classic_tour_slp_welcome_b3', "Your dashboard")
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

// THE SLP TOPICS (2026-10-12, tour redesign: docs/task-management/2026-10-12_tour-redesign.md). Requested:
// "SLPs: favorites, caseload, Model, dashboards." Basic's Boards tab has no favorites view (Suggested,
// Mine, Community, Recent), so that step is "Your boards". Model is a tile on each communicator card
// (`.ch-comm__actions`, classic-view.hbs), on the Communicators tab.
//
//   `sel`    — target selector (first VISIBLE match wins)
//   `tab`    — the tab the target lives on; the step opens it first, and is kept at build time when
//              the target is not on screen but the tab is, then skipped at show time if still absent
//   `on`     — popover placement; floating-ui flips automatically if there is no room
//   `padded` — region targets that want a roomy rounded cutout rather than a tight hug
//   `last`   — ends the tour from this step instead of a separate outro
function interiorSteps() {
  return [
    {
      id: 'classic_tour_slp_boards',
      sel: '.ch-tabs [data-tour-tab="boards"]',
      on: 'bottom',
      padded: true,
      title: i18n.t('classic_tour_slp_boards_title', "Your boards"),
      text: tourChecklist([
        i18n.t('classic_tour_slp_boards_b1', "Boards has Suggested, Mine, Community and Recent"),
        i18n.t('classic_tour_slp_boards_b2', "Create a board, or find one for a communicator")
      ], null, null, CLASSIC)
    },
    {
      id: 'classic_tour_slp_caseload',
      sel: '.ch-tabs [data-tour-tab="supervisees"]',
      on: 'bottom',
      padded: true,
      title: i18n.t('classic_tour_slp_caseload_title', "Your caseload"),
      text: tourChecklist([
        i18n.t('classic_tour_slp_caseload_b1', "Communicators lists everyone you support"),
        i18n.t('classic_tour_slp_caseload_b2', "Each card has their goal, reports and boards")
      ], null, null, CLASSIC)
    },
    {
      id: 'classic_tour_slp_model',
      sel: '.ch-comm__actions',
      tab: 'supervisees',
      on: 'bottom',
      padded: true,
      title: i18n.t('classic_tour_slp_model_title', "Model on their board"),
      text: tourChecklist([
        i18n.t('classic_tour_slp_model_b1', "Model opens a communicator's board so you can show words as you talk"),
        i18n.t('classic_tour_slp_model_b2', "It appears once that communicator has a home board")
      ], null, null, CLASSIC)
    },
    {
      id: 'classic_tour_slp_dashboards',
      sel: '.ch-rail',
      on: 'right',
      padded: true,
      last: true,
      title: i18n.t('classic_tour_slp_dash_title', "Your dashboard"),
      text: tourChecklist([
        i18n.t('classic_tour_slp_dash_b1', "Rooms takes you into a room and its communicators"),
        i18n.t('classic_tour_slp_dash_b2', "Your home board, logging and offline sync live here")
      ], i18n.t('classic_tour_cards_lead', "You can take this tour again any time from the side menu."), null, CLASSIC)
    }
  ];
}

// Opens the tab a step's target lives on, through the tab's own button (`data-tour-tab`, classic-view.hbs).
function tabButton(name) { return document.querySelector('.ch-tabs [data-tour-tab="' + name + '"]'); }
function showTab(name) {
  var tab = tabButton(name);
  if (tab && !tab.classList.contains('is-active')) { tab.click(); }
}

// The Model step opens the Communicators tab and nothing else put it back
// (GitHub #1131). Remember the tab that was active before the first switch, put
// it back when the next step shows, and again if the tour is cancelled first.
// Shepherd destroys every step on cancel and on complete (shepherd.js tour._done),
// and a step's `when.destroy` runs then.
var homeTabBeforeTour = null;
function activeTabName() {
  var active = document.querySelector('.ch-tabs .ch-tab.is-active');
  return active ? active.getAttribute('data-tour-tab') : null;
}
function rememberHomeTab() {
  if (homeTabBeforeTour) { return; }
  homeTabBeforeTour = activeTabName();
}
function restoreHomeTab() {
  var name = homeTabBeforeTour;
  homeTabBeforeTour = null;
  if (name) { showTab(name); }
}

function pushInteriorSteps(steps) {
  var restoreOnNext = false;
  interiorSteps().forEach(function(cfg) {
    var el = visibleEl(cfg.sel);
    var later = !el && !!cfg.tab && !!tabButton(cfg.tab);
    if (!el && !later) { return; }
    var wait = waitForElement(cfg.sel);
    var beforeShow = wait;
    if (cfg.tab) {
      beforeShow = function() {
        rememberHomeTab();
        showTab(cfg.tab);
        return wait();
      };
      restoreOnNext = true;
    } else if (restoreOnNext) {
      beforeShow = function() {
        restoreHomeTab();
        return wait();
      };
      restoreOnNext = false;
    }
    var step = {
      id: cfg.id,
      // Resolve the target LIVE at show time so a control that re-rendered, shifted, or
      // painted a beat late (common under deployment latency, where the DOM is not as
      // instant as on a dev machine) is still spotlighted.
      attachTo: { element: liveTarget(cfg.sel, el), on: cfg.on },
      beforeShowPromise: beforeShow,
      when: cfg.tab ? { destroy: function() { restoreHomeTab(); } } : undefined,
      title: cfg.title,
      text: cfg.text,
      classes: 'ch-tour__step',
      // The final step ends the tour itself, so there is no separate outro screen.
      //
      // An ACTION, not `type: 'complete'`: ember-shepherd's makeButton accepts only
      // back/cancel/next as types and ASSERTS otherwise, which in a development build once
      // stopped this whole tour from starting.
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
    step.scrollBlock = 'center';
    if (cfg.padded) {
      step.modalOverlayOpeningPadding = 12;
      step.modalOverlayOpeningRadius = 18;
      step.matchTargetRadius = false;
    }
    if (cfg.tab) { step.showOn = function() { return !!visibleBySelector(cfg.sel); }; }
    steps.push(step);
  });
}

// `options` is accepted for signature parity with the other builders (the registry's
// thunk forwards caller options through); this tour has no handoff, so nothing reads it
// yet. Kept so adding one later does not change every call site.
// eslint-disable-next-line no-unused-vars
function buildClassicHomeSteps(options) {
  var steps = [];
  options = options || {};
  // A COMMUNICATOR gets the one-card welcome (Start talking now / Choose a different board / Take a quick
  // tour), in Basic's skin; their tour runs on their board (2026-10-12, tour redesign).
  if (!options.supporter) { return [communicatorWelcomeStep(true, !!options.hasHome)]; }
  // A SUPPORTER (an SLP): five steps (2026-10-12, "5 steps with a welcome").
  steps.push(welcomeStep());
  pushInteriorSteps(steps);
  return steps;
}

export { buildClassicHomeSteps };
export default buildClassicHomeSteps;
