// Board-detail SPEAK (use) mode guided tour — walks a user through using their
// board to communicate. Auto-started after "Pick this Board" hands the user off
// to their new home board in speak mode (see board-preview-overlay#pick_for_home
// + guided-tour#_consumePendingBoardDetailSpeakTour), and replayable from the
// "Take a tour" trigger.
//
// Like the other page tours this is DOM-driven and visibility-INDEPENDENT: every
// interior step resolves its target with visibleEl() and is SKIPPED when that
// element isn't on screen — so it adapts to layout differences (e.g. the speak /
// backspace / clear buttons collapse into a single quick-actions menu on narrow
// "immersive" widths, and the back button only appears inside a folder). Serves
// BOTH dashboard layouts from one builder; `layout` only tags each step for the
// Focused-View skin.
//
// Every string is a literal `i18n.t` key + English-default call so
// i18n_generator.rb's STATIC parser can extract it (see LEARNINGS.md on the
// static-parser gotcha — bound/dynamic keys are invisible to it).
import i18n from '../i18n';
import { standardButtons, decoratedTitle, tourChecklist, visibleEl, liveTarget, waitForElement } from './shared';

// i18n extraction no-op: the centered welcome/done steps build their heading via
// decoratedTitle('key', "Default"), and i18n_generator.rb's static scanner only
// recognises LITERAL `i18n.t` key + default calls — so those title keys would
// otherwise never reach the locale files. Listing them here as literal calls makes
// the generator extract + translate them. Never called at runtime. If you add
// another decoratedTitle() heading, add its literal here too.
// eslint-disable-next-line no-unused-vars
function _board_detail_speak_tour_i18n_extractor_no_op() {
  i18n.t('board_detail_speak_tour_welcome_title', "Your board is ready");
  i18n.t('board_detail_speak_tour_done_title', "You're ready to communicate");
}

// Centered intro step (no attachTo) — frames what speak mode is for.
function welcomeStep() {
  return {
    id: 'board_detail_speak_tour_welcome',
    title: decoratedTitle('board_detail_speak_tour_welcome_title', "Your board is ready"),
    text: tourChecklist([
      i18n.t('board_detail_speak_tour_welcome_b1', "Tap buttons to build a message"),
      i18n.t('board_detail_speak_tour_welcome_b2', "Hear it spoken aloud"),
      i18n.t('board_detail_speak_tour_welcome_b3', "Open folders to find more words")
    ], i18n.t('board_detail_speak_tour_welcome_lead', "This is Speak Mode — where your communicator talks.")),
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

// The interior spotlights, in reading order. Each resolves its target from the
// live DOM and is skipped when absent. `on` is the popover placement (Popper
// flips automatically if there isn't room). `padded` marks square-cornered
// REGIONS (the board grid) that want a roomy rounded cutout.
function interiorSteps() {
  /* FOUR STEPS IN ALL (requested 2026-10-12: "the board page speak tour should be only 4 steps total"):
     welcome, these two spotlights, finish. It walked one step per control (grid, message, speak,
     tools, home, more options); the message bar's five now share one step on the row that holds
     them, as the home and board-picker tours were consolidated. */
  return [
    {
      id: 'board_detail_speak_tour_grid',
      sel: '.md-board-detail-grid-fade',
      on: 'top',
      padded: true,
      // Nudged down 10rem — the grid fills the page so this popover rides at the
      // very top. See .md-tour__step--bds-grid in app.scss.
      cls: 'md-tour__step--bds-grid',
      title: i18n.t('board_detail_speak_tour_grid_title', "Tap to communicate"),
      text: tourChecklist([
        i18n.t('board_detail_speak_tour_grid_b1', "Each button speaks or adds a word"),
        i18n.t('board_detail_speak_tour_grid_b2', "Folders open to more words"),
        i18n.t('board_detail_speak_tour_grid_b3', "Explore at your own pace")
      ])
    },
    {
      // The whole sentence row (templates/user/board-detail.hbs `#speak`): Home on the left, the message
      // with Speak and the backspace / clear tools, and the More options menu.
      id: 'board_detail_speak_tour_bar',
      sel: '.md-board-detail-sentence-row',
      on: 'bottom',
      padded: true,
      title: i18n.t('board_detail_speak_tour_bar_title', "Your message bar"),
      text: tourChecklist([
        i18n.t('board_detail_speak_tour_message_b1', "Words you choose appear here"),
        i18n.t('board_detail_speak_tour_speak_b1', "Tap to say your message out loud"),
        i18n.t('board_detail_speak_tour_bar_fix', "Backspace or clear to fix your message"),
        i18n.t('board_detail_speak_tour_bar_more', "Home takes you back; the menu has more options")
      ])
    }
  ];
}

// Push one step per VISIBLE interior target, attaching to the RESOLVED element
// (not the selector string) so Shepherd can't grab a hidden sibling. Absent
// targets are skipped, so the tour adapts to whichever controls are on screen.
function pushInteriorSteps(steps) {
  interiorSteps().forEach(function(cfg) {
    var el = visibleEl(cfg.sel);
    if (!el) { return; }
    var step = {
      id: cfg.id,
      // Resolve the target LIVE at show time + WAIT (bounded) for it before
      // positioning, so a control that re-rendered or painted late is still
      // spotlighted. visibleEl() above still gates/orders the step.
      attachTo: { element: liveTarget(cfg.sel, el), on: cfg.on },
      beforeShowPromise: waitForElement(cfg.sel),
      title: cfg.title,
      text: cfg.text,
      classes: 'md-tour__step' + (cfg.cls ? ' ' + cfg.cls : ''),
      buttons: standardButtons()
    };
    // Force a center-scroll for every step so placement is consistent (rather than
    // the runner's "already visible? skip" fast-path, which would let floating-ui
    // flip the popover).
    step.scrollBlock = 'center';
    // Region targets (the board grid) get a roomy rounded cutout instead of the
    // tight shape-match; matchTargetRadius:false keeps the rounded corners.
    if (cfg.padded) {
      step.modalOverlayOpeningPadding = 12;
      step.modalOverlayOpeningRadius = 18;
      step.matchTargetRadius = false;
    }
    steps.push(step);
  });
}

// Centered outro — recap + a "Got it" button that completes the tour. No handoff,
// so it uses the done/outro skin (not the forward-arrow handoff variant).
function doneStep() {
  return {
    id: 'board_detail_speak_tour_done',
    title: decoratedTitle('board_detail_speak_tour_done_title', "You're ready to communicate"),
    text: tourChecklist([
      i18n.t('board_detail_speak_tour_welcome_b1', "Tap buttons to build a message"),
      i18n.t('board_detail_speak_tour_welcome_b2', "Hear it spoken aloud"),
      i18n.t('board_detail_speak_tour_welcome_b3', "Open folders to find more words")
    ], null,
      i18n.t('board_detail_speak_tour_done_text', "You can replay this tour anytime from the Take a tour button.")),
    classes: 'md-tour__step md-tour__step--intro md-tour__step--outro',
    buttons: [
      {
        text: i18n.t('board_detail_speak_tour_finish', "Got it"),
        classes: 'md-tour__btn md-tour__btn--primary',
        action: function() { return this.complete(); }
      }
    ]
  };
}

// Build the full ordered step list for board-detail speak mode. `layout` is
// 'gentle' or 'focused' (defaults to 'gentle') and only tags each step for the
// Focused-View skin — structure is discovered from the live DOM. `options` is
// accepted for API symmetry with the other builders; this tour has no handoff, so
// it always builds the linear walkthrough.
// eslint-disable-next-line no-unused-vars
function buildBoardDetailSpeakSteps(layout, options) {
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

export { buildBoardDetailSpeakSteps };
export default buildBoardDetailSpeakSteps;
