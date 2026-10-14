// Board-detail EDIT mode guided tour — walks a user through editing a board
// (page-set): the editing session, naming, the button grid, editing a button,
// the board-tools and button-styling panels, and saving.
//
// Like the home / board-picker tours, this is DOM-driven and visibility-
// INDEPENDENT: every interior step resolves its target with visibleEl() and is
// SKIPPED when that element isn't on screen, so the tour stays correct across
// edit-mode states (collapsed side panels, a board whose buttons haven't loaded
// yet, etc.). It serves BOTH dashboard layouts from one builder — `layout` only
// tags each step so the popover picks up the Focused-View skin; structure is
// discovered from the live DOM.
//
// The guided-tour RUNNER (components/guided-tour.js) applies the smooth
// "scroll the highlight into view, then gently fade the card in" transition and
// the step-to-step cross-fade to EVERY attached step of EVERY tour, so this tour
// inherits all of it for free — steps just declare an optional placement (`on`)
// and scroll hint (`block`).
//
// Adding copy: every string is a literal `i18n.t` key + English-default call so
// i18n_generator.rb's STATIC parser can extract it (see LEARNINGS.md on the
// static-parser gotcha — bound/dynamic keys are invisible to it).
import i18n from '../i18n';
import { standardButtons, decoratedTitle, tourChecklist, visibleEl, liveTarget, waitForElement, doneCelebration } from './shared';

// i18n extraction no-op: the two centered steps build their heading through
// decoratedTitle('key', "Default"), and i18n_generator.rb's static scanner only
// recognises LITERAL `i18n.t` key + default calls — so those title keys would
// never reach the locale files (see LEARNINGS.md). Listing them here as literal
// i18n.t calls makes the generator extract + translate them. Never called at
// runtime. If you add another decoratedTitle() heading, add its literal here too.
// eslint-disable-next-line no-unused-vars
function _board_detail_tour_i18n_extractor_no_op() {
  i18n.t('board_detail_tour_welcome_title', "Make this board your own");
  i18n.t('board_detail_tour_done_title', "You're ready to build");
}

// Centered intro step (no attachTo) — frames what edit mode is for.
function welcomeStep() {
  return {
    id: 'board_detail_tour_welcome',
    title: decoratedTitle('board_detail_tour_welcome_title', "Make this board your own"),
    text: tourChecklist([
      i18n.t('board_detail_tour_welcome_b1', "Add and edit buttons"),
      i18n.t('board_detail_tour_welcome_b2', "Change colors, text, and layout"),
      i18n.t('board_detail_tour_welcome_b3', "Save when it looks just right")
    ], i18n.t('board_detail_tour_welcome_lead', "You're now editing this board. Here's how to shape every part of it.")),
    /* --bd-welcome: scopes the board-detail welcome card's extra height (it's a bit
       taller than the other tours' welcome cards — see app.scss). */
    classes: 'md-tour__step md-tour__step--intro md-tour__step--welcome md-tour__step--bd-welcome',
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

// The interior spotlights, in reading order. Each entry resolves its target from
// the live DOM and is skipped when absent. `on` is the popover placement (Popper
// flips automatically if there isn't room). `padded` marks container-type targets
// (regions, not single rounded controls) for a roomy rounded cutout. `block` is
// the scroll hint forwarded to the runner.
function interiorSteps() {
  /* FOUR STEPS IN ALL (requested 2026-10-12: "the board page edit tour should be only 4 steps total"):
     welcome, these two spotlights, finish. It walked eight (the session bar, board details, the grid, one
     button, both side panels, Save, Cancel); the buttons now come first and the editing bar last, with
     Save, Cancel and the side panels named there. */
  return [
    {
      id: 'board_detail_tour_grid',
      sel: '.md-board-detail-grid',
      on: 'top',
      padded: true,
      title: i18n.t('board_detail_tour_grid_title', "Your board's buttons"),
      text: tourChecklist([
        i18n.t('board_detail_tour_grid_b1', "Every tile here is a button"),
        i18n.t('board_detail_tour_grid_b4', "Click on them to edit each button"),
        i18n.t('board_detail_tour_grid_b2', "Drag buttons to rearrange them"),
        i18n.t('board_detail_tour_grid_b5', "Drag and drop images to update images")
      ])
    },
    {
      id: 'board_detail_tour_session',
      sel: '.md-board-edit-session',
      on: 'bottom',
      padded: true,
      title: i18n.t('board_detail_tour_session_title', "You're in edit mode"),
      text: tourChecklist([
        i18n.t('board_detail_tour_session_b3', "Save keeps your work"),
        i18n.t('board_detail_tour_session_b2', "Cancel undoes all your changes"),
        i18n.t('board_detail_tour_session_panels', "Board tools and styles are in the side panels"),
        i18n.t('board_detail_tour_finish_top_note', "Save and Cancel also sit at the top of the page for quick access")
      ])
    }
  ];
}

// Push one step per VISIBLE interior target, attaching to the RESOLVED element
// (not the selector string) so Shepherd can't grab a hidden sibling. Absent
// targets are skipped, so the tour adapts to whichever edit-mode state is on
// screen (collapsed panels, not-yet-loaded buttons).
function pushInteriorSteps(steps) {
  interiorSteps().forEach(function(cfg) {
    var el = visibleEl(cfg.sel);
    if (!el) { return; }
    var step = {
      id: cfg.id,
      // Resolve the target LIVE at show time (liveTarget), not the build-time
      // element ref, and WAIT (bounded) for it before positioning — so a target
      // that re-rendered or painted late (deployment latency) is still
      // spotlighted instead of the popover flying off / centering. visibleEl()
      // above still gates whether the step is added and orders it.
      attachTo: { element: liveTarget(cfg.sel, el), on: cfg.on },
      beforeShowPromise: waitForElement(cfg.sel),
      title: cfg.title,
      text: cfg.text,
      classes: 'md-tour__step',
      buttons: standardButtons()
    };
    // Force a scroll so each target is centered before its popover shows (the
    // runner positions once at the settled spot — no flip-flash).
    step.scrollBlock = cfg.block || 'center';
    // `padded` targets are square-cornered REGIONS (session bar, details card,
    // grid, side panels) — give them a roomy, rounded cutout instead of the tight
    // square the default shape-match produces. matchTargetRadius:false tells
    // guided-tour.js NOT to snap the radius back to the element's own corners.
    if (cfg.padded) {
      step.modalOverlayOpeningPadding = 12;
      step.modalOverlayOpeningRadius = 18;
      step.matchTargetRadius = false;
    }
    steps.push(step);
  });
}

// Centered outro — recap + a single Finish button that completes the tour
// (the runner records completion + cleans up on `complete`). Unlike the home /
// board-picker tours, there's no further handoff: the user stays here editing.
function doneStep() {
  return {
    id: 'board_detail_tour_done',
    title: decoratedTitle('board_detail_tour_done_title', "You're ready to build"),
    text: doneCelebration() + tourChecklist([
      i18n.t('board_detail_tour_welcome_b1', "Add and edit buttons"),
      i18n.t('board_detail_tour_welcome_b2', "Change colors, text, and layout"),
      i18n.t('board_detail_tour_welcome_b3', "Save when it looks just right")
    ], null,
      i18n.t('board_detail_tour_done_text', "You can reopen this tour anytime from the Take a tour button while editing.")),
    classes: 'md-tour__step md-tour__step--intro md-tour__step--outro',
    buttons: [
      {
        text: i18n.t('board_detail_tour_finish', "Finish"),
        classes: 'md-tour__btn md-tour__btn--primary',
        action: function() { this.complete(); }
      }
    ]
  };
}

// Build the full ordered step list for the board-detail EDIT page. `layout` is
// 'gentle' or 'focused' (defaults to 'gentle') and only tags each step so the
// popover picks up the Focused-View skin — structure is discovered from the live
// DOM. `options` is accepted for API symmetry with the other builders; this tour
// has no handoff, so it always builds the linear walkthrough.
function buildBoardDetailSteps(layout, options) {
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

export { buildBoardDetailSteps };
export default buildBoardDetailSteps;
