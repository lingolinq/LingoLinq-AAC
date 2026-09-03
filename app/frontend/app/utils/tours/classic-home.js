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
import { standardButtons, decoratedTitle, tourChecklist, visibleEl, liveTarget, waitForElement } from './shared';

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
  i18n.t('classic_tour_done_title', "You know your way around");
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

// The interior spotlights, in reading order: the rail first (who you are, what still
// needs setting up), then the action cards.
//   `sel`    — target selector (first VISIBLE match wins)
//   `on`     — popover placement; floating-ui flips automatically if there is no room
//   `padded` — region targets that want a roomy rounded cutout rather than a tight hug
function interiorSteps() {
  return [
    {
      id: 'classic_tour_identity',
      sel: '.ch-rail__identity',
      on: 'bottom',
      title: i18n.t('classic_tour_identity_title', "Your account"),
      text: tourChecklist([
        i18n.t('classic_tour_identity_b1', "Check who you are signed in as"),
        i18n.t('classic_tour_identity_b2', "Open your profile, password and subscription")
      ], null, null, CLASSIC)
    },
    {
      // The rail's setup rows: home board, supervisors, logging, sync. A region, so it
      // takes the padded cutout rather than hugging one row.
      id: 'classic_tour_rail',
      sel: '.ch-rail__list',
      on: 'right',
      padded: true,
      title: i18n.t('classic_tour_rail_title', "Your setup"),
      text: tourChecklist([
        i18n.t('classic_tour_rail_b1', "See your home board and who supports you"),
        i18n.t('classic_tour_rail_b2', "Turn logging on to build reports"),
        i18n.t('classic_tour_rail_b3', "Sync before you go somewhere without wifi")
      ], null, null, CLASSIC)
    },
    {
      id: 'classic_tour_speak',
      sel: '.ch-tile--speak-main',
      on: 'bottom',
      title: i18n.t('classic_tour_speak_title', "Speak"),
      text: tourChecklist([
        i18n.t('classic_tour_speak_b1', "Opens your board ready to talk"),
        i18n.t('classic_tour_speak_b2', "The one button you will use most")
      ], null, null, CLASSIC)
    },
    {
      id: 'classic_tour_reports',
      sel: '.ch-tile--reports',
      on: 'bottom',
      title: i18n.t('classic_tour_reports_title', "Reports"),
      text: tourChecklist([
        i18n.t('classic_tour_reports_b1', "See which words are being used"),
        i18n.t('classic_tour_reports_b2', "Needs logging turned on first")
      ], null, null, CLASSIC)
    },
    {
      // Deliberately spotlights the CLOSED toggle and describes what it opens, rather
      // than opening the drawer as part of the tour. Opening it would make the ten
      // revealed tiles targets that only exist mid-tour, and the runner disables the
      // spotlit element (`canClickTarget: false`), so a user could not act on them
      // anyway. Describing beats animating here.
      id: 'classic_tour_extras',
      sel: '.ch-tile--extras-toggle',
      on: 'bottom',
      title: i18n.t('classic_tour_extras_title', "Extras"),
      text: tourChecklist([
        i18n.t('classic_tour_extras_b1', "Opens the rest of your tools"),
        i18n.t('classic_tour_extras_b2', "Boards, settings, messages and recordings")
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
    }
  ];
}

function pushInteriorSteps(steps) {
  interiorSteps().forEach(function(cfg) {
    var el = visibleEl(cfg.sel);
    if (!el) { return; }
    var step = {
      id: cfg.id,
      // Resolve the target LIVE at show time so a control that re-rendered, shifted, or
      // painted a beat late (common under deployment latency, where the DOM is not as
      // instant as on a dev machine) is still spotlighted.
      attachTo: { element: liveTarget(cfg.sel, el), on: cfg.on },
      beforeShowPromise: waitForElement(cfg.sel),
      title: cfg.title,
      text: cfg.text,
      classes: 'ch-tour__step' + (cfg.cls ? ' ' + cfg.cls : ''),
      buttons: standardButtons(CLASSIC)
    };
    // Force a scroll for every step so placement is consistent, rather than the runner's
    // "already visible? skip" fast-path, which would let floating-ui flip the popover.
    step.scrollBlock = cfg.block || 'center';
    if (cfg.padded) {
      step.modalOverlayOpeningPadding = 12;
      step.modalOverlayOpeningRadius = 18;
      step.matchTargetRadius = false;
    }
    steps.push(step);
  });
}

// Centered outro. No handoff — unlike the modern home tour there is no board-picker
// step to pass to; a classic user who needs a board reaches it from the rail.
function doneStep() {
  return {
    id: 'classic_tour_done',
    title: decoratedTitle('classic_tour_done_title', "You know your way around", CLASSIC),
    text: tourChecklist([
      i18n.t('classic_tour_done_b1', "Speak whenever you are ready"),
      i18n.t('classic_tour_done_b2', "Everything else is one tap away")
    ], i18n.t('classic_tour_done_lead', "You can take this tour again any time from the rail."), null, CLASSIC),
    classes: 'ch-tour__step ch-tour__step--intro ch-tour__step--done',
    buttons: [
      {
        text: i18n.t('home_tour_done', "Got it"),
        type: 'complete',
        classes: 'ch-tour__btn ch-tour__btn--primary'
      }
    ]
  };
}

// `options` is accepted for signature parity with the other builders (the registry's
// thunk forwards caller options through); this tour has no handoff, so nothing reads it
// yet. Kept so adding one later does not change every call site.
// eslint-disable-next-line no-unused-vars
function buildClassicHomeSteps(options) {
  var steps = [];
  steps.push(welcomeStep());
  pushInteriorSteps(steps);
  steps.push(doneStep());
  return steps;
}

export { buildClassicHomeSteps };
export default buildClassicHomeSteps;
