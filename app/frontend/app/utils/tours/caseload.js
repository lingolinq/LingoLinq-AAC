// Caseload page guided tour — walks a supporter (SLP/therapist/teacher/parent,
// i.e. `supporter_role`) through every part of their caseload: the roster, the
// filter, each per-communicator quick action, and the expanded panel's actions,
// goals and badge progress. Replayable from the "Take a tour" trigger in the
// navbar, and auto-started for a newly-registered supporter (see
// guided-tour.js#_scheduleAutoOpen, which routes supporters HERE instead of
// running the dashboard tour + board-picker handoff — an SLP has no home board
// of their own to pick).
//
// Like the other page tours this is DOM-driven and visibility-INDEPENDENT: every
// interior step resolves its target with visibleEl() and is SKIPPED when that
// element isn't on screen. That is what makes it correct at every screen size
// without a single media query here — narrow layouts collapse or drop controls
// (the filter only renders above a roster-size threshold, the hero is hidden
// entirely in Focused View) and those steps simply fall out of the walkthrough.
// Serves BOTH dashboard layouts from one builder; `layout` only tags each step
// for the Focused-View skin.
//
// Every string is a literal `i18n.t` key + English-default call so
// i18n_generator.rb's STATIC parser can extract it (see LEARNINGS.md on the
// static-parser gotcha — bound/dynamic keys are invisible to it). User-facing
// defaults are DOUBLE-quoted; a single-quoted default is silently dropped.
import i18n from '../i18n';
import { standardButtons, decoratedTitle, tourChecklist, visibleEl, visibleBySelector, liveTarget, waitForElement } from './shared';

// i18n extraction no-op: the centered welcome/done steps build their heading via
// decoratedTitle('key', "Default"), and i18n_generator.rb's static scanner only
// recognises LITERAL `i18n.t` key + default calls — so those title keys would
// otherwise never reach the locale files. Listing them here as literal calls
// makes the generator extract + translate them. Never called at runtime. If you
// add another decoratedTitle() heading, add its literal here too.
// eslint-disable-next-line no-unused-vars
function _caseload_tour_i18n_extractor_no_op() {
  i18n.t('caseload_tour_welcome_title', "Your caseload");
  i18n.t('caseload_tour_done_title', "You're set up to support");
}

// Selector for the roster row's expand trigger — the button that opens a
// communicator's detail panel. Used both as a tour target and as the element the
// panel-expanding beforeShowPromise clicks.
var ROW_TRIGGER_SEL = '.md-caseload__list-trigger';
// The expanded detail panel. Present in the DOM ONLY while a row is selected
// (templates/caseload.hbs gates it on `supervisee.user_name == selectedSupervisee`).
var PANEL_SEL = '.md-caseload__card';

// Centered intro step (no attachTo) — frames what the caseload page is for.
function welcomeStep() {
  return {
    id: 'caseload_tour_welcome',
    title: decoratedTitle('caseload_tour_welcome_title', "Your caseload"),
    text: tourChecklist([
      i18n.t('caseload_tour_welcome_b1', "See everyone you support in one list"),
      i18n.t('caseload_tour_welcome_b2', "Jump straight into modeling or speaking"),
      i18n.t('caseload_tour_welcome_b3', "Track goals and progress for each person")
    ], i18n.t('caseload_tour_welcome_lead', "This is your caseload — your home base for the people you support.")),
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

// The interior spotlights, in reading order down the page. Each resolves its
// target from the live DOM and is skipped when absent.
//   `sel`     — target selector (first VISIBLE match wins)
//   `on`      — popover placement; Popper flips automatically if there's no room
//   `padded`  — square-cornered REGIONS that want a roomy rounded cutout
//   `expand`  — expand the first roster row before showing (panel-only targets)
function interiorSteps() {
  return [
    // ---- Page chrome -------------------------------------------------------
    {
      // The primary pill-nav (Caseload · Dashboard · Organizations · Boards …).
      // Placed 'bottom': it sits at the very top of the page, so a popover above
      // it would have nowhere to go.
      id: 'caseload_tour_nav',
      sel: '.md-shell--caseload .md-pillnav',
      on: 'bottom',
      padded: true,
      title: i18n.t('caseload_tour_nav_title', "Move around the app"),
      text: tourChecklist([
        i18n.t('caseload_tour_nav_b1', "Caseload is where you start"),
        i18n.t('caseload_tour_nav_b2', "Dashboard has your own tools and settings"),
        i18n.t('caseload_tour_nav_b3', "Reports, Boards and Account are a tap away")
      ])
    },
    {
      // Gentle View only — Focused View hides the hero (_focused-view.scss), so
      // visibleEl() returns null there and this step drops out on its own.
      id: 'caseload_tour_hero',
      sel: '.md-caseload__hero',
      on: 'bottom',
      title: i18n.t('caseload_tour_hero_title', "People you support"),
      text: tourChecklist([
        i18n.t('caseload_tour_hero_b1', "Everyone who has been linked to you appears below"),
        i18n.t('caseload_tour_hero_b2', "Ask a communicator or their organization to connect you")
      ])
    },
    {
      // Only rendered above a roster-size threshold (showSuperviseeFilter), so a
      // supporter with a short caseload never sees this step.
      id: 'caseload_tour_filter',
      sel: '.md-caseload__filter',
      on: 'bottom',
      padded: true,
      title: i18n.t('caseload_tour_filter_title', "Find someone fast"),
      text: tourChecklist([
        i18n.t('caseload_tour_filter_b1', "Search by name or by goal"),
        i18n.t('caseload_tour_filter_b2', "Useful once your caseload grows")
      ])
    },
    // ---- The roster --------------------------------------------------------
    {
      id: 'caseload_tour_list',
      sel: '.md-caseload__list',
      on: 'top',
      padded: true,
      // DO NOT SCROLL FOR THIS STEP (2026-08-16, requested). The roster is the one target
      // here that grows without bound, and the shared centre-scroll dragged the view
      // partway down it — the step introduces "one row per communicator" while the first
      // communicators sit above the fold. Aligning its top ('start') still moved the page.
      // 'none' leaves the view exactly where the previous step (the filter, immediately
      // above the roster) left it, so the spotlight lands on the roster in place and the
      // popover — `on: 'top'` — sits directly above the first row.
      block: 'none',
      title: i18n.t('caseload_tour_list_title', "Your roster"),
      text: tourChecklist([
        i18n.t('caseload_tour_list_b1', "One row per communicator"),
        i18n.t('caseload_tour_list_b2', "Tap a row to open their full details")
      ])
    },
    {
      // Access badges (Edit / Modeling only / View only). Worth its own step:
      // what a supporter CAN do varies per person, and the badge is the only
      // place that is stated.
      id: 'caseload_tour_access',
      sel: '.md-caseload__list-badges',
      on: 'bottom',
      title: i18n.t('caseload_tour_access_title', "What you're allowed to do"),
      text: tourChecklist([
        i18n.t('caseload_tour_access_b1', "Editor gives you full access to edit boards and settings"),
        i18n.t('caseload_tour_access_b2', "Modeling only lets you model on their boards"),
        i18n.t('caseload_tour_access_b3', "View only is read-only — ask them to change it")
      ])
    },
    // ---- Per-communicator quick actions ------------------------------------
    {
      id: 'caseload_tour_quick',
      sel: '.md-caseload__list-quick',
      on: 'top',
      padded: true,
      title: i18n.t('caseload_tour_quick_title', "Quick actions"),
      text: tourChecklist([
        i18n.t('caseload_tour_quick_b1', "The things you do most, right on the row"),
        i18n.t('caseload_tour_quick_b2', "No need to open the panel first"),
        i18n.t('caseload_tour_quick_b3', "Greyed-out actions need more access")
      ])
    },
    {
      id: 'caseload_tour_model',
      sel: '.md-caseload__quick-action--model',
      on: 'top',
      title: i18n.t('caseload_tour_model_title', "Model on their board"),
      text: tourChecklist([
        i18n.t('caseload_tour_model_b1', "Opens their board in modeling mode"),
        i18n.t('caseload_tour_model_b2', "Show a word by using it yourself"),
        i18n.t('caseload_tour_model_b3', "Modeling is not logged as their own talking")
      ])
    },
    {
      id: 'caseload_tour_choose_board',
      sel: '.md-caseload__quick-action--choose-board',
      on: 'top',
      title: i18n.t('caseload_tour_choose_board_title', "Set a home board"),
      text: tourChecklist([
        i18n.t('caseload_tour_choose_board_b1', "Pick the board they start on"),
        i18n.t('caseload_tour_choose_board_b2', "Shows for anyone who has no board yet")
      ])
    },
    {
      id: 'caseload_tour_speak',
      sel: '.md-caseload__quick-action--speak',
      on: 'top',
      title: i18n.t('caseload_tour_speak_title', "Open Speak Mode"),
      text: tourChecklist([
        i18n.t('caseload_tour_speak_b1', "Hand the device over ready to talk"),
        i18n.t('caseload_tour_speak_b2', "Everything they say is logged as theirs")
      ])
    },
    {
      id: 'caseload_tour_reports',
      sel: '.md-caseload__quick-action--reports',
      on: 'top',
      title: i18n.t('caseload_tour_reports_title', "See how it's going"),
      text: tourChecklist([
        i18n.t('caseload_tour_reports_b1', "Usage, words and progress over time"),
        i18n.t('caseload_tour_reports_b2', "Good preparation for a session or a meeting")
      ])
    },
    {
      id: 'caseload_tour_ideas',
      sel: '.md-caseload__quick-action--ideas',
      on: 'top',
      title: i18n.t('caseload_tour_ideas_title', "Modeling ideas"),
      text: tourChecklist([
        i18n.t('caseload_tour_ideas_b1', "Suggestions for words to model next"),
        i18n.t('caseload_tour_ideas_b2', "Built from the words they already use")
      ])
    },
    {
      id: 'caseload_tour_more',
      sel: '.md-caseload__quick-action--more',
      on: 'top',
      title: i18n.t('caseload_tour_more_title', "Open the full panel"),
      text: tourChecklist([
        i18n.t('caseload_tour_more_b1', "Expands everything for this person"),
        i18n.t('caseload_tour_more_b2', "Tapping anywhere on the row does the same")
      ])
    },
    // ---- The expanded panel ------------------------------------------------
    // These targets exist only while a row is expanded, so they carry
    // `expand: true` — pushInteriorSteps gives them a beforeShowPromise that
    // opens the first row first.
    {
      id: 'caseload_tour_panel_actions',
      sel: '.md-caseload__actions--tiles',
      on: 'top',
      padded: true,
      expand: true,
      title: i18n.t('caseload_tour_panel_actions_title', "Everything else for this person"),
      text: tourChecklist([
        i18n.t('caseload_tour_panel_actions_b1', "Their account and home board settings"),
        i18n.t('caseload_tour_panel_actions_b2', "Run an evaluation or review past ones"),
        i18n.t('caseload_tour_panel_actions_b3', "Add a progress note after a session")
      ])
    },
    {
      id: 'caseload_tour_goals',
      /* EXCLUDE the badge block. `.md-caseload__bottom-row__goal` is used twice in the
         panel — once inside `.md-caseload__bottom-row--badge` (caseload.hbs:354) and
         once by the real goals block (:456) — and visibleBySelector returns the FIRST
         visible match. The badge block always renders once badgeLoading is false, so
         the step titled "Goals" spotlighted the BADGE every time. */
      sel: '.md-caseload__bottom-row:not(.md-caseload__bottom-row--badge) .md-caseload__bottom-row__goal',
      on: 'top',
      padded: true,
      expand: true,
      title: i18n.t('caseload_tour_goals_title', "Goals"),
      text: tourChecklist([
        i18n.t('caseload_tour_goals_b1', "Set what you're working towards together"),
        i18n.t('caseload_tour_goals_b2', "Track it as active, met or paused"),
        i18n.t('caseload_tour_goals_b3', "Goals show up in their reports too")
      ])
    },
    {
      id: 'caseload_tour_badge',
      sel: '.md-caseload__badge',
      on: 'top',
      padded: true,
      expand: true,
      title: i18n.t('caseload_tour_badge_title', "Progress at a glance"),
      text: tourChecklist([
        i18n.t('caseload_tour_badge_b1', "Shows how far along the current goal is"),
        i18n.t('caseload_tour_badge_b2', "Updates on its own as they use their board")
      ])
    }
  ];
}

// Expand the FIRST roster row so the panel-only steps have something to attach
// to, then wait (bounded) for the panel to paint. A programmatic click is used
// rather than reaching into the controller so the page's own toggle logic — and
// whatever it does to `selectedSupervisee` — stays the single source of truth.
// No-ops when a row is already expanded (the user may have opened one before
// starting the tour), so the tour never collapses what they were looking at.
// Never hangs: resolves as soon as the panel is visible, or after ~1.5s (20 x
// 75ms) regardless — the same bound waitForElement() uses.
function expandFirstRow() {
  return function() {
    return new Promise(function(resolve) {
      if (!visibleBySelector(PANEL_SEL)) {
        var trigger = visibleBySelector(ROW_TRIGGER_SEL);
        // Guarded: a supporter with an EMPTY caseload has no rows at all, in
        // which case there is nothing to expand and the panel steps will be
        // skipped by their own visibleEl() gate anyway.
        if (trigger && trigger.click) {
          try { trigger.click(); } catch (e) { /* never block the tour */ }
        }
      }
      var tries = 0;
      var tick = function() {
        if (visibleBySelector(PANEL_SEL) || tries++ >= 20) { resolve(); return; }
        window.setTimeout(tick, 75);
      };
      tick();
    });
  };
}

/* Open the row, THEN wait for the step's own target — which is what the call site's
   comment has always claimed. expandFirstRow() resolves as soon as the PANEL exists,
   but a panel step's real target may still be in flight: the badge needs two round
   trips (store.query then findRecord), so its step showed with the target still absent,
   liveTarget returned null, Shepherd fell back to document.body and the card rendered
   unattached, highlighting nothing. */
function expandThenWait(selector) {
  var expand = expandFirstRow();
  var wait = waitForElement(selector);
  return function() {
    return expand().then(function() { return wait(); });
  };
}

// Push one step per interior target. Steps whose target is already on screen are
// gated by visibleEl(); `expand` steps are gated instead on a roster row EXISTING
// (their real target only appears after the row opens, so a build-time
// visibility check would always fail and drop them).
function pushInteriorSteps(steps) {
  interiorSteps().forEach(function(cfg) {
    var el = visibleEl(cfg.sel);
    if (cfg.expand) {
      // Include the step as long as there is a row to expand; the target itself
      // is resolved live at show time, after expandFirstRow() has run.
      if (!visibleEl(ROW_TRIGGER_SEL)) { return; }
    } else if (!el) {
      return;
    }
    var step = {
      id: cfg.id,
      // Resolve the target LIVE at show time so a control that re-rendered,
      // shifted, or painted a beat late (common under deployment latency, where
      // the DOM is not as instant as on a dev machine) is still spotlighted.
      attachTo: { element: liveTarget(cfg.sel, el), on: cfg.on },
      // Panel steps must open the row FIRST, then wait for their own target;
      // everything else just waits for its target.
      beforeShowPromise: cfg.expand ? expandThenWait(cfg.sel) : waitForElement(cfg.sel),
      title: cfg.title,
      text: cfg.text,
      // Per-step class hook, same spelling the board-picker tour uses (`cfg.cls`) so the
      // two tours share one convention rather than each inventing their own.
      classes: 'md-tour__step' + (cfg.cls ? ' ' + cfg.cls : ''),
      buttons: standardButtons()
    };
    // Force a scroll for every step so placement is consistent (rather than the runner's
    // "already visible? skip" fast-path, which would let floating-ui flip the popover).
    // CENTRE BY DEFAULT, overridable per step via `cfg.block` — the same hint the
    // board-picker tour uses (utils/tours/board-picker.js) rather than a second convention.
    // Centring is wrong for a TALL target: it scrolls the middle of the element to the
    // middle of the pane, which for the roster means landing partway DOWN the list.
    step.scrollBlock = cfg.block || 'center';
    // Region targets (the nav, the list, the quick-action strip, the panel
    // blocks) get a roomy rounded cutout instead of the tight shape-match;
    // matchTargetRadius:false keeps the rounded corners.
    if (cfg.padded) {
      step.modalOverlayOpeningPadding = 12;
      step.modalOverlayOpeningRadius = 18;
      step.matchTargetRadius = false;
    }
    steps.push(step);
  });
}

// Centered outro — recap + a "Got it" button that completes the tour. No handoff
// (a supporter has nothing they must do next), so it uses the done/outro skin
// rather than the forward-arrow handoff variant.
function doneStep() {
  return {
    id: 'caseload_tour_done',
    title: decoratedTitle('caseload_tour_done_title', "You're set up to support"),
    text: tourChecklist([
      i18n.t('caseload_tour_done_b1', "Tap a row to open someone's details"),
      i18n.t('caseload_tour_done_b2', "Model, speak or check reports from the row"),
      i18n.t('caseload_tour_done_b3', "Set goals to track what you're working on")
    ], null,
      i18n.t('caseload_tour_done_text', "You can replay this tour anytime from the Take a tour button.")),
    classes: 'md-tour__step md-tour__step--intro md-tour__step--outro',
    buttons: [
      {
        text: i18n.t('caseload_tour_finish', "Got it"),
        classes: 'md-tour__btn md-tour__btn--primary',
        action: function() { return this.complete(); }
      }
    ]
  };
}

// Build the full ordered step list for the caseload page. `layout` is 'gentle' or
// 'focused' (defaults to 'gentle') and only tags each step for the Focused-View
// skin — structure is discovered from the live DOM, so the two views share one
// builder exactly as the home tour does. `options` is accepted for API symmetry
// with the other builders; this tour has no handoff, so it always builds the
// linear walkthrough.
// eslint-disable-next-line no-unused-vars
function buildCaseloadSteps(layout, options) {
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

export { buildCaseloadSteps };
export default buildCaseloadSteps;
