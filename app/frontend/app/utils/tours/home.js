// Home page guided tour — serves BOTH Gentle View and Focused View from one builder:
// `buildHomeSteps(layout)`.
//
// FOUR STEPS (requested 2026-10-11): a centered welcome, the dashboard cards, the navigation, and a
// centered finish. The two middle steps spotlight live elements resolved from the DOM (the card
// grid, then the pill nav or its collapsed dropdown), so they follow the user's layout and skip
// anything not on screen. Returning users who finished it before get a topic MENU over the same two
// areas (buildHomeMenuSteps). `layout` only adds the Focused skin class.

import i18n from '../i18n';
import { standardButtons, decoratedTitle, tourChecklist, tourBodyButton, setIdentityDropdownOpen, visibleEl, waitForElement, doneCelebration, nextAdvance } from './shared';

// Centered intro step (no attachTo). The "Skip tour for now" off-ramp is a full
// BODY button (not a footer link) that jumps to the skip-handoff step
// (home_tour_skip_handoff) so a user who isn't ready for the walkthrough is still
// shown where the tour button lives before heading to the board picker. The footer
// keeps only "Start the tour"; the cancel X (cancelIcon) still allows a plain close.
function welcomeStep() {
  return {
    id: 'home_tour_welcome',
    title: decoratedTitle('home_tour_welcome_title', "Welcome to LingoLinq"),
    text: tourBodyButton(
      i18n.t('home_tour_welcome_take_tour', "Take a tour of your <span class=\"md-hero__gradient-text\">home page</span>"),
      // Same as the footer "Start the tour" button — advance to the first step.
      'next'
    ) +
    '<div class="md-tour__or" aria-hidden="true"><span class="md-tour__or-text md-hero__gradient-text">' + i18n.t('home_tour_or', "OR") + '</span></div>' +
    tourBodyButton(
      i18n.t('home_tour_skip_choose_board', "Skip tour for now<br>Let's <span class=\"md-hero__gradient-text\">choose my board</span> (page-set)"),
      'show:home_tour_skip_handoff',
      { note: i18n.t('home_tour_skip_return_note', "You can always return to the tour later.") }
    ) +
    '<div class="md-tour__or" aria-hidden="true"><span class="md-tour__or-text md-hero__gradient-text">' + i18n.t('home_tour_or', "OR") + '</span></div>' +
    tourBodyButton(
      i18n.t('home_tour_welcome_start_speaking', "I'd like to <span class=\"md-hero__gradient-text\">start speaking</span><br>Pick a board (page-set) for me"),
      // `speak` dispatch: guided-tour.js routes to the user's OWN Vocal Flair 84
      // copy (`<user_name>/vocal-flair-84`, copied at registration) in board-detail
      // SPEAK mode, polling until the copy is ready first (see _startSpeakingHandoff).
      'speak'
    ),
    // --welcome carries an extra class so ONLY the first (welcome) page can be
    // nudged higher than the shared intro/outro offset (the outro reuses
    // --intro but stays at the default position). See app.scss.
    classes: 'md-tour__step md-tour__step--intro md-tour__step--welcome',
    buttons: [
      // Sole footer control now — the body buttons drive the choices (Take a tour
      // advances the tour; Skip / Start speaking hand off). This closes the tour
      // and stays on the page; type:'cancel' ends it without navigating and
      // without marking it completed. The footer right-aligns its buttons, so with
      // only this one it sits where the old "Start the tour" button was.
      {
        text: i18n.t('home_tour_exit', "Exit Tour"),
        type: 'cancel',
        classes: 'md-tour__btn md-tour__btn--ghost'
      }
    ]
  };
}

// Off-ramp reached from the welcome step's "Skip tour for now" button. Spotlights
// the header tour TRIGGER so the user learns they can relaunch the tour anytime,
// then hands them to the board picker via "Choose Board". Reached ONLY via
// tour.show('home_tour_skip_handoff') — it's appended at the END of the step list
// (see buildHomeSteps), so it never sits in the linear Next flow. "Choose Board"
// calls complete(), which fires the runner's first-time board-picker handoff
// (firstTimeNav, bound to the Tour's complete event) — or the registration setup
// handoff in that flow. If the trigger isn't on screen (collapsed header), the
// step falls back to a centered card with the same copy.
function skipHandoffStep() {
  // Attach to the tour trigger by SELECTOR STRING (not a build-time visibleEl()
  // element ref). The trigger's base rule is `position: fixed` and several
  // layouts keep it fixed (app.scss .md-tour__trigger / .md-hero--dashboard);
  // visibleEl() keys off offsetParent, which is ALWAYS null for a fixed element,
  // so the old build-time lookup returned null and the step fell back to a
  // centered card that never spotlighted the trigger (the reported bug). A
  // selector lets Shepherd re-resolve the (single, home-page) trigger when the
  // step actually shows — surviving re-render — and waitForElement() waits
  // (bounded) for it to have layout so a late paint still lands on it. If the
  // trigger genuinely never renders, Shepherd centers the card on its own, so
  // the graceful fallback is preserved without a build-time branch.
  return {
    id: 'home_tour_skip_handoff',
    attachTo: { element: '.md-tour__trigger', on: 'bottom' },
    beforeShowPromise: waitForElement('.md-tour__trigger'),
    modalOverlayOpeningPadding: 7,
    modalOverlayOpeningRadius: 14,
    matchTargetRadius: false,
    title: decoratedTitle('home_tour_skip_return_title', "Return to the tour anytime"),
    text: '<p class="md-tour__lead">' + i18n.t('home_tour_skip_return_lead', "Let's help you choose your Board, but before we go, the Tour button highlighted above is how you can access this tour again. Now let's <span class=\"md-hero__gradient-text\">get started</span>!") + '</p>',
    classes: 'md-tour__step md-tour__step--navbar',
    buttons: [
      {
        // Returns to the welcome tile this off-ramp jumps from. The skip-handoff
        // step is appended at the END of the step list (not in linear order), so
        // a plain type:'back' would land on the wrong neighbor — show() the
        // welcome step by id instead.
        text: i18n.t('home_tour_back', "Back"),
        classes: 'md-tour__btn md-tour__btn--ghost',
        action: function() { return this.show('home_tour_welcome'); }
      },
      {
        text: i18n.t('home_tour_choose_board', "Choose Board"),
        classes: 'md-tour__btn md-tour__btn--primary',
        action: function() { return this.complete(); }
      }
    ]
  };
}

// Primary nav + one explainer per visible nav pill. Nav sits at the top of the
// page so 'bottom' placement is correct at every width. On very narrow layouts
// (<= $aac-breakpoint-xs) the pill row is hidden and collapses to a single
// dropdown trigger, so the nav step targets whichever control is actually
// visible (never attach a step to a hidden element); the per-pill steps are
// added only when the pill row itself is on-screen. Keys are static literals
// (not a loop with bound keys) so i18n_generator.rb can extract them — see
// LEARNINGS.md on the static-parser gotcha.
/* Tour copy per pill, keyed by the `data-tour-pill` value the nav renders.
   Each entry is a FUNCTION so the i18n lookups run when the tour is built (with the active
   locale loaded) rather than at module load, and every key is a literal string so
   i18n_generator.rb's static scanner can extract it -- see LEARNINGS.md on the dynamic-key
   gotcha. Adding a pill to the nav means adding its key here; leaving it out costs nothing
   and simply produces no step for that pill. */
var PILL_COPY = {
  dashboard: function() { return { title: i18n.t('home_tour_page_dashboard_title', "Dashboard"), text: tourChecklist([
    i18n.t('home_tour_page_home_b1', "Pick up where you left off"),
    i18n.t('home_tour_page_home_b2', "Your most-used tools at a glance")
  ]) }; },
  caseload: function() { return { title: i18n.t('home_tour_page_caseload_title', "Caseload"), text: tourChecklist([
    i18n.t('home_tour_page_caseload_b1', "Everyone you support, in one list"),
    i18n.t('home_tour_page_caseload_b2', "Open a communicator to model or take notes")
  ]) }; },
  organizations: function() { return { title: i18n.t('home_tour_page_orgs_title', "Organizations"), text: tourChecklist([
    i18n.t('home_tour_page_orgs_b1', "Manage the organizations you run"),
    i18n.t('home_tour_page_orgs_b2', "Add people and assign supervisors")
  ]) }; },
  /* ROOMS STANDS IN FOR ORGANIZATIONS for a rooms-only supervisor -- the nav draws one or the
     other in that slot, never both (components/user-pill-nav.hbs). Without an entry here the
     tour would simply skip the pill, leaving that user's nav half-described. */
  rooms: function() { return { title: i18n.t('home_tour_page_rooms_title', "Rooms"), text: tourChecklist([
    i18n.t('home_tour_page_rooms_b1', "The rooms you supervise, in one list"),
    i18n.t('home_tour_page_rooms_b2', "Open a room to see its communicators and reports")
  ]) }; },
  boards: function() { return { title: i18n.t('home_tour_page_boards_title', "Boards"), text: tourChecklist([
    i18n.t('home_tour_page_boards_b1', "Browse & create boards"),
    i18n.t('home_tour_page_boards_b2', "Open any board to view or edit")
  ]) }; },
  extras: function() { return { title: i18n.t('home_tour_page_extras_title', "Extras"), text: tourChecklist([
    i18n.t('home_tour_page_extras_b1', "Games & lessons"),
    i18n.t('home_tour_page_extras_b2', "Settings & more tools")
  ]) }; },
  updates: function() { return { title: i18n.t('home_tour_page_updates_title', "Updates"), text: tourChecklist([
    i18n.t('home_tour_page_updates_b1', "Messages and notes sent to you"),
    i18n.t('home_tour_page_updates_b2', "The badge counts what you have not read")
  ]) }; }
};

/* The visible pill labels as one readable list ("Dashboard, Caseload, Boards, Extras and
   Updates"), for the nav overview step. Reads the nav's own rendered text, so it is already
   in the user's language and already reflects their role and feature flags. Returns '' when
   the nav is collapsed to its dropdown or not on screen, and the caller falls back. */
function navPillSummary() {
  var labels = Array.prototype.slice.call(document.querySelectorAll('.md-pillnav [data-tour-pill]'))
    .filter(function(el) { return el.offsetParent !== null; })
    // The LABEL only: a copy without the Updates pill's count badge and its screen-reader text,
    // which otherwise run into it ("Updates3has new updates") (2026-10-01).
    .map(function(el) {
      var copy = el.cloneNode(true);
      copy.querySelectorAll('.md-pillnav__badge, .sr-only').forEach(function(n) { n.remove(); });
      return (copy.textContent || '').replace(/\s+/g, ' ').trim();
    })
    .filter(function(t) { return t.length; });
  if (!labels.length) { return ''; }
  if (labels.length === 1) { return labels[0]; }
  var last = labels.pop();
  return labels.join(', ') + ' ' + i18n.t('and', "and") + ' ' + last;
}

// Centered outro step. Two variants share the SAME completion summary (the
// checklist of what the Home Page tour covered):
//   • `handoff` true  — the first-time flow that hands the user straight off to
//     the board picker. Swaps the success checkmark for a forward "next"
//     animation and tells them their next step is to pick a communication
//     board (page-set). The single button advances the tour, whose `complete`
//     event fires the board-picker handoff (see guided-tour.js _scheduleAutoOpen).
//   • otherwise — a manual replay via "Take a tour": celebratory checkmark,
//     "You're all set", Finish.
// (single button — type:next on the last step completes the tour via Shepherd's
// auto-complete.)
function doneStep(handoff) {
  if (handoff) {
    return {
      id: 'home_tour_done',
      title: decoratedTitle('home_tour_next_title', "Next: pick your communication board (page-set)"),
      text: nextAdvance() + tourChecklist([
        i18n.t('home_tour_welcome_b1', "Your boards & Speak Mode"),
        i18n.t('home_tour_welcome_b2', "Reports & insights"),
        i18n.t('home_tour_welcome_b3', "Account, settings & more")
      ],
        i18n.t('home_tour_next_lead', "You've finished the Home Page tour."),
        i18n.t('home_tour_next_text', "Now let's pick the communication board (page-set) you'll use to start talking.")),
      classes: 'md-tour__step md-tour__step--intro md-tour__step--outro md-tour__step--next',
      buttons: [
        {
          text: i18n.t('home_tour_pick_board', "Pick my board (page-set)"),
          // Explicit complete() (not type:'next') so this terminal button can't
          // advance into the appended home_tour_skip_handoff step. complete() fires
          // the same first-time board-picker handoff the linear finish always did.
          action: function() { return this.complete(); },
          classes: 'md-tour__btn md-tour__btn--primary'
        }
      ]
    };
  }
  return {
    id: 'home_tour_done',
    title: decoratedTitle('home_tour_done_title', "You're all set with the Home Page"),
    text: doneCelebration() + tourChecklist([
      i18n.t('home_tour_welcome_b1', "Your boards & Speak Mode"),
      i18n.t('home_tour_welcome_b2', "Reports & insights"),
      i18n.t('home_tour_welcome_b3', "Account, settings & more")
    ], null,
      i18n.t('home_tour_done_text', "You can return anytime from the Take a tour button at the top of the dashboard.")),
    classes: 'md-tour__step md-tour__step--intro md-tour__step--outro',
    buttons: [
      {
        text: i18n.t('home_tour_finish', "Finish"),
        // Explicit complete() (not type:'next') so this terminal button can't
        // advance into the appended home_tour_skip_handoff step.
        action: function() { return this.complete(); },
        classes: 'md-tour__btn md-tour__btn--primary'
      }
    ]
  };
}

// =============================================================================
// Second-round MENU mode (returning users who've completed the tour before)
// =============================================================================
// Instead of re-walking the whole linear tour, a user who has already finished
// the Home Page tour gets a HUB: a centered menu listing the page's topic areas
// as a button list. Picking one spotlights that area with EXPANDED detail (more
// about what each thing does than the first-run copy), with a "Back to menu"
// button so they can hop around to whatever they want a refresher on. Walking
// "Next" through the topics ends at the celebratory done step — which here also
// offers a link back to the board picker. Built via Shepherd's `tour.show(id)`
// jump navigation (button `action` is bound to the Tour — verified in
// shepherd.js), so the menu and "Back to menu" buttons can target steps by id.

// Resolve each topic's spotlight element from the live DOM, skipping any whose
// element isn't on screen (mirrors the linear tour's DOM-driven defensiveness so
// the menu never lists a topic it can't spotlight). Each topic is a SINGLE
// spotlight with its own expanded copy. Order matches the linear tour's reading
// order: toolbar → navigation → cards → account.
function menuTopics() {
  var topics = [];
  // Dashboard cards — spotlight the whole grid so the cutout wraps every card.
  var gridEl = visibleEl('.md-grid--dashboard');
  if (gridEl) {
    topics.push({
      id: 'home_tour_t_cards', el: gridEl, on: 'top',
      menuLabel: i18n.t('home_tour_menu_cards_label', "Your dashboard cards"),
      title: i18n.t('home_tour_menu_cards_title', "Your dashboard cards"),
      text: tourChecklist([
        i18n.t('home_tour_menu_cards_b1', "Open Speak Mode to start communicating"),
        i18n.t('home_tour_menu_cards_b2', "Jump straight to your boards, reports and account"),
        i18n.t('home_tour_menu_cards_b3', "Drag to reorder, or show/hide cards from Display style"),
        i18n.t('home_tour_menu_cards_b4', "Whatever you use most stays front and center")
      ], i18n.t('home_tour_menu_cards_lead', "These cards are your shortcuts into everything you do here:"))
    });
  }
  // Navigation pills. The second line NAMES THE PILLS THAT ARE ACTUALLY THERE (navPillSummary),
  // so it stays true for every role and feature flag, in the nav's own localized labels.
  var navEl = visibleEl('.md-pillnav') || visibleEl('.md-pillnav-dropdown__trigger') || visibleEl('.md-pillnav-dropdown');
  if (navEl) {
    topics.push({
      id: 'home_tour_t_nav', el: navEl, on: 'bottom',
      menuLabel: i18n.t('home_tour_menu_nav_label', "Navigation"),
      title: i18n.t('home_tour_menu_nav_title', "Moving around LingoLinq"),
      text: tourChecklist([
        i18n.t('home_tour_nav_b1', "Switch sections in one tap"),
        navPillSummary() || i18n.t('home_tour_nav_b2_generic', "Every section of the app, one tap away")
      ])
    });
  }
  return topics;
}

// The centered hub. Each topic becomes a full-width menu button that jumps to its
// spotlight via the Tour's show(); a final "Finish" entry jumps to the done step.
function menuStep(topics) {
  var buttons = topics.map(function(t) {
    return {
      text: t.menuLabel,
      classes: 'md-tour__btn md-tour__menu-btn',
      action: function() { return this.show(t.id); }
    };
  });
  buttons.push({
    text: i18n.t('home_tour_menu_finish', "Finish & wrap up"),
    classes: 'md-tour__btn md-tour__menu-btn md-tour__menu-btn--finish',
    action: function() { return this.show('home_tour_done'); }
  });
  return {
    id: 'home_tour_menu',
    title: decoratedTitle('home_tour_menu_title', "Take the tour again"),
    text: '<p class="md-tour__lead">' +
      i18n.t('home_tour_menu_lead', "You've explored your Home Page before — jump to whatever you'd like a closer look at.") +
      '</p>',
    classes: 'md-tour__step md-tour__step--intro md-tour__step--menu',
    buttons: buttons
  };
}

// One spotlight step per topic, with a "Back to menu" button + Next (Next walks
// the topics in order, ending at the done step).
function topicStep(t) {
  var step = {
    id: t.id,
    attachTo: { element: t.el, on: t.on },
    title: t.title,
    text: t.text,
    classes: 'md-tour__step' + (t.padded ? ' md-tour__step--navbar' : ''),
    buttons: [
      {
        text: i18n.t('home_tour_back_to_menu', "Back to menu"),
        classes: 'md-tour__btn md-tour__btn--ghost',
        action: function() { return this.show('home_tour_menu'); }
      },
      {
        text: i18n.t('home_tour_next', "Next"),
        type: 'next',
        classes: 'md-tour__btn md-tour__btn--primary'
      }
    ]
  };
  // Padded/rounded stylized cutout for the square chrome targets (toolbar, avatar).
  if (t.padded) {
    step.modalOverlayOpeningPadding = 8;
    step.modalOverlayOpeningRadius = 16;
    step.matchTargetRadius = false;
  }
  // Account topic opens the identity dropdown before positioning (guided-tour.js
  // keeps it open for this step's id and closes it again on any other step/end).
  if (t.openDropdown) {
    step.beforeShowPromise = function() { setIdentityDropdownOpen(true); return Promise.resolve(); };
  }
  return step;
}

// The same topic as a step of the first-time tour: Back/Next rather than "Back to menu".
function tourTopicStep(t) {
  var step = topicStep(t);
  step.buttons = standardButtons();
  return step;
}

// Menu-mode outro — the celebratory green check (restored from the manual-replay
// done step) PLUS a link back to the board picker so a returning user can hop
// over to pick/change their communication board. `onPickBoard` (supplied by the
// component, which owns the router) navigates there; we complete() the tour first
// so the overlay tears down before the route transition.
function menuDoneStep(onPickBoard) {
  return {
    id: 'home_tour_done',
    title: decoratedTitle('home_tour_done_title', "You're all set with the Home Page"),
    text: doneCelebration() + tourChecklist([
      i18n.t('home_tour_welcome_b1', "Your boards & Speak Mode"),
      i18n.t('home_tour_welcome_b2', "Reports & insights"),
      i18n.t('home_tour_welcome_b3', "Account, settings & more")
    ], null,
      i18n.t('home_tour_menu_done_text', "Refreshed on the Home Page. You can reopen this menu anytime from the Take a tour button.")),
    classes: 'md-tour__step md-tour__step--intro md-tour__step--outro',
    buttons: [
      {
        text: i18n.t('home_tour_goto_board_picker', "Go to your board picker (page-set)"),
        classes: 'md-tour__btn md-tour__btn--board-link',
        action: function() { this.complete(); if (onPickBoard) { onPickBoard(); } }
      },
      {
        text: i18n.t('home_tour_finish', "Finish"),
        type: 'next',
        classes: 'md-tour__btn md-tour__btn--primary'
      }
    ]
  };
}

// Menu-mode ordered step list: the hub, one spotlight per resolved topic, then the
// celebratory done step (with the board-picker link). Falls back to null when no
// topics resolve (e.g. a stripped-down page), so the caller can run the linear
// tour instead of showing an empty menu.
function buildHomeMenuSteps(layout, options) {
  options = options || {};
  var topics = menuTopics();
  if (!topics.length) { return null; }
  var steps = [];
  steps.push(menuStep(topics));
  topics.forEach(function(t) { steps.push(topicStep(t)); });
  steps.push(menuDoneStep(options.onPickBoard));
  if (layout === 'focused') {
    steps.forEach(function(s) {
      s.classes = ((s.classes || '') + ' md-tour__step--focused').trim();
    });
  }
  return steps;
}

// Build the full ordered step list for the home page. `layout` is 'gentle' or
// 'focused' (defaults to 'gentle'); it only affects per-layout copy — structure
// is discovered from the live DOM, so it's correct even if `layout` is omitted.
// `options.handoff` selects the outro variant: true when the tour will hand the
// user straight off to the board picker (first-time flow), so the final step
// previews that next step instead of a dead-end "Finish". `options.menu` (set for
// returning users who've already completed this tour) swaps the linear walkthrough
// for the topic MENU; if no topic resolves it falls back to the linear tour.
function buildHomeSteps(layout, options) {
  options = options || {};
  if (options.menu) {
    var menuSteps = buildHomeMenuSteps(layout, options);
    if (menuSteps) { return menuSteps; }
  }
  var steps = [];
  steps.push(welcomeStep());
  // FOUR STEPS IN ALL (requested 2026-10-11): welcome, the dashboard cards, the navigation, finish.
  // It walked one step per toolbar button, account-menu item, nav pill and card (~25). The two
  // middle steps are the same summaries the replay menu shows, with Back/Next instead of "Back to
  // menu"; a topic whose element is not on screen is skipped.
  menuTopics().forEach(function(t) { steps.push(tourTopicStep(t)); });
  steps.push(doneStep(options.handoff));
  // The welcome step's "Skip tour for now" off-ramp. Appended LAST so it's reachable
  // via tour.show('home_tour_skip_handoff') but never sits in the linear Next chain
  // (the terminal doneStep button uses an explicit complete(), so its Next can't
  // fall into this). Excluded from the progress dots in guided-tour.js.
  steps.push(skipHandoffStep());
  // Focused View: tag every step so the popover picks up the Focused-View skin
  // (Focused palette + gradient CTA) — see `.md-tour__step--focused` in app.scss.
  if (layout === 'focused') {
    steps.forEach(function(s) {
      s.classes = ((s.classes || '') + ' md-tour__step--focused').trim();
    });
  }
  return steps;
}

export { buildHomeSteps, navPillSummary };
export default buildHomeSteps;
