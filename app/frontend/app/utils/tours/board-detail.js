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
  return [
    {
      id: 'board_detail_tour_session',
      sel: '.md-board-edit-session',
      on: 'bottom',
      padded: true,
      title: i18n.t('board_detail_tour_session_title', "You're in edit mode"),
      text: tourChecklist([
        i18n.t('board_detail_tour_session_b1', "This bar shows you're editing"),
        i18n.t('board_detail_tour_session_b2', "Discard undoes all your changes"),
        i18n.t('board_detail_tour_session_b3', "Done Editing saves your work")
      ])
    },
    {
      id: 'board_detail_tour_details',
      sel: '.md-board-detail-header__edit-card',
      on: 'bottom',
      padded: true,
      title: i18n.t('board_detail_tour_details_title', "Name your board"),
      text: tourChecklist([
        i18n.t('board_detail_tour_details_b1', "Give your board a clear name"),
        i18n.t('board_detail_tour_details_b2', "Add a short description"),
        i18n.t('board_detail_tour_details_b3', "Choose who can see it")
      ])
    },
    {
      id: 'board_detail_tour_grid',
      sel: '.md-board-detail-grid',
      on: 'top',
      padded: true,
      title: i18n.t('board_detail_tour_grid_title', "Your board's buttons"),
      text: tourChecklist([
        i18n.t('board_detail_tour_grid_b1', "Every tile here is a button"),
        i18n.t('board_detail_tour_grid_b2', "Drag buttons to rearrange them"),
        i18n.t('board_detail_tour_grid_b3', "This is what your communicator sees"),
        i18n.t('board_detail_tour_grid_b4', "Click on them to edit each button"),
        i18n.t('board_detail_tour_grid_b5', "Drag and drop images to update images")
      ])
    },
    {
      // A single button cell — explain how to edit one. Target the card wrapper
      // (NOT its nested edit-action buttons) so the spotlight reads as the button.
      id: 'board_detail_tour_button',
      sel: '.md-board-detail-symbol-card',
      on: 'bottom',
      title: i18n.t('board_detail_tour_button_title', "Edit any button"),
      text: tourChecklist([
        i18n.t('board_detail_tour_button_b1', "Tap a button to change it"),
        i18n.t('board_detail_tour_button_b2', "Add a word and a picture"),
        i18n.t('board_detail_tour_button_b3', "Link it to another board")
      ])
    },
    {
      id: 'board_detail_tour_tools',
      sel: '.md-board-edit-panel',
      on: 'right',
      padded: true,
      title: i18n.t('board_detail_tour_tools_title', "Board tools and actions"),
      // The Action Panel groups every board-level tool into labelled sections —
      // describe the SECTIONS (not one sub-action), so it doesn't read like
      // "add this panel to your sidebar". The last item notes the collapse/expand
      // chevron as its own checklist line.
      text: tourChecklist([
        i18n.t('board_detail_tour_tools_b1', "Board Actions: set as home, favorite, board ideas, and more"),
        i18n.t('board_detail_tour_tools_b2', "Search & Filter your buttons by name or category"),
        i18n.t('board_detail_tour_tools_b3', "Share & Print to copy, download, or print this board"),
        i18n.t('board_detail_tour_tools_b4', "Collapse the panel for more room, then expand it whenever you need a tool.")
      ],
        i18n.t('board_detail_tour_tools_lead', "Every tool for this board lives here, grouped into sections:"))
    },
    {
      id: 'board_detail_tour_style',
      sel: '.md-board-edit-right-panel',
      on: 'left',
      padded: true,
      title: i18n.t('board_detail_tour_style_title', "Style and customize your board"),
      // The Settings Panel splits into two accordion groups; name EVERY section
      // (grouped by the panel's own Button Settings / Board Settings headers) so
      // the tour reflects the full panel, not just a few styling tools.
      text: tourChecklist([
        i18n.t('board_detail_tour_style_b1', "Button Settings: Levels, Hidden, Paint, Shape & Border, Text & Image"),
        i18n.t('board_detail_tour_style_b2', "Board Settings: Background, Layout, Symbols, Menu, Folders, Skin-Tones, Speak Bar, Word Prediction"),
        i18n.t('board_detail_tour_style_b3', "Tap a section to open it; collapse the panel for more room")
      ],
        i18n.t('board_detail_tour_style_lead', "Fine-tune how this board looks and works, grouped into two sections:"))
    },
    {
      id: 'board_detail_tour_save',
      sel: '.md-board-edit-session__btn--save',
      on: 'bottom',
      title: i18n.t('board_detail_tour_save_title', "Save your work"),
      text: tourChecklist([
        i18n.t('board_detail_tour_save_b1', "Press Done Editing to save"),
        i18n.t('board_detail_tour_save_b2', "Your changes go live right away"),
        i18n.t('board_detail_tour_save_b3', "You can edit again anytime"),
        i18n.t('board_detail_tour_finish_top_note', "Done Editing and Discard also sit at the top of the page for quick access")
      ])
    },
    {
      // Discard counterpart, shown AFTER the Done Editing (save) showcase. The
      // session bar pairs Done Editing with Discard, so spotlight Discard too.
      // `board_detail_tour_finish_top_note` is SHARED with the save step above —
      // both buttons are ALSO mirrored at the top of the page
      // (md-board-detail-header__edit-actions), so each step notes it.
      id: 'board_detail_tour_discard',
      sel: '.md-board-edit-session__btn--discard',
      on: 'bottom',
      title: i18n.t('board_detail_tour_discard_title', "Discard your changes"),
      text: tourChecklist([
        i18n.t('board_detail_tour_discard_b1', "Press Discard to undo all your edits"),
        i18n.t('board_detail_tour_discard_b2', "The board goes back to how it was before"),
        i18n.t('board_detail_tour_finish_top_note', "Done Editing and Discard also sit at the top of the page for quick access")
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
