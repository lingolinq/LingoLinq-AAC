// Home page guided tour — serves BOTH Gentle View and Focused View from one builder:
// `buildHomeSteps(layout)`.
//
// A COMMUNICATOR gets one welcome card (communicatorWelcomeStep); their tour runs on their board.
// A SUPPORTER (an SLP) gets FIVE STEPS (2026-10-12 redesign): a centered welcome, then favorites,
// caseload, Model and dashboards, each spotlighting a live element resolved from the DOM (skipped when
// not on screen), the last one finishing the tour. Returning supporters get a topic MENU over the same
// four topics (buildHomeMenuSteps). `layout` only adds the Focused skin class.

import i18n from '../i18n';
import { standardButtons, decoratedTitle, tourChecklist, tourBodyButton, setIdentityDropdownOpen, visibleEl, doneCelebration } from './shared';

// THE COMMUNICATOR WELCOME (2026-10-12, tour redesign: docs/task-management/2026-10-12_tour-redesign.md).
// One clear choice. Requested: "a primary Start talking now button with the board picture and 'We'll set
// up Vocal Flair 60. You can change it anytime.' Add a secondary Choose a different board and a small Take
// a quick tour (1 min) link." The communicator's tour itself runs on their board (board-detail-speak.js /
// board-alt-speak.js), so on the home page this card is the whole tour.
// Actions (components/guided-tour.js#_welcomeAction): `speak` = utils/tours/start_talking.js (Vocal
// Flair 60 becomes the home board, then Speak Mode); `picker` = the board picker; `speak_tour` = as
// `speak`, then the board tour. `classic` renders it in Basic's tour skin (classic-home.js).
var STARTER_IMAGE = '/images/vocal-flair-60.png';
function communicatorWelcomeStep(classic) {
  var p = classic ? 'ch' : 'md';
  var start = tourBodyButton(
    '<img class="md-tour__starter-img" src="' + STARTER_IMAGE + '" alt="">' +
    '<span class="md-tour__starter-label">' + i18n.t('tour_welcome_start_talking', "Start talking now") + '</span>',
    'speak',
    { classes: 'md-tour__body-btn--primary md-tour__body-btn--starter', note: i18n.t('tour_welcome_start_talking_note', "We'll set up Vocal Flair 60. You can change it anytime.") }
  );
  var choose = tourBodyButton(i18n.t('tour_welcome_choose_board', "Choose a different board"), 'picker', { classes: 'md-tour__body-btn--secondary' });
  var quick = '<div class="md-tour__quick-tour"><button type="button" class="md-tour__quick-tour-link" data-tour-action="speak_tour">' +
    i18n.t('tour_welcome_quick_tour', "Take a quick tour (1 min)") + '</button></div>';
  return {
    id: 'home_tour_welcome',
    title: decoratedTitle('home_tour_welcome_title', "Welcome to LingoLinq", classic ? { classic: true } : undefined),
    text: start + choose + quick,
    classes: classic ? 'ch-tour__step ch-tour__step--intro ch-tour__step--welcome-comm' : 'md-tour__step md-tour__step--intro md-tour__step--welcome md-tour__step--welcome-comm',
    buttons: [
      {
        text: i18n.t('home_tour_exit', "Exit Tour"),
        type: 'cancel',
        classes: p + '-tour__btn ' + p + '-tour__btn--ghost'
      }
    ]
  };
}

// THE SUPPORTER WELCOME (SLPs and others with `supporter_role`). Centered, no attachTo: one "Take a tour"
// body button that advances the tour, and Exit Tour. A supporter has no board of their own to pick, so
// there are no board choices (a communicator gets communicatorWelcomeStep instead, 2026-10-12).
function welcomeStep() {
  return {
    id: 'home_tour_welcome',
    title: decoratedTitle('home_tour_welcome_title', "Welcome to LingoLinq"),
    text: tourBodyButton(i18n.t('home_tour_welcome_take_tour', "Take a tour of your <span class=\"md-hero__gradient-text\">home page</span>"), 'next'),
    // --welcome lets only this first page sit higher than the shared intro offset (see app.scss).
    classes: 'md-tour__step md-tour__step--intro md-tour__step--welcome',
    buttons: [
      {
        text: i18n.t('home_tour_exit', "Exit Tour"),
        type: 'cancel',
        classes: 'md-tour__btn md-tour__btn--ghost'
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

// What the tour covered, for the replay menu's finish step.
function summaryItems() {
  return [
    i18n.t('home_tour_welcome_b1', "Your boards & Speak Mode"),
    i18n.t('home_tour_welcome_b2', "Reports & insights"),
    i18n.t('home_tour_welcome_b3', "Account, settings & more")
  ];
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

// THE SLP TOPICS (2026-10-12, tour redesign: docs/task-management/2026-10-12_tour-redesign.md). Requested:
// "SLPs: favorites, caseload, Model, dashboards." One spotlight each, resolved from the live DOM; a topic
// whose target is not on screen is skipped. Model is on the Caseload page (templates/caseload.hbs, the
// Model quick action), so its step points at the way there. When the pill nav collapses to its dropdown
// (narrow screens), the Boards and Model steps point at the dropdown instead.
var NAV_DROPDOWN = '.md-pillnav-dropdown__trigger';
function menuTopics() {
  var topics = [];
  var boardsEl = visibleEl('.md-pillnav [data-tour-pill="boards"]') || visibleEl(NAV_DROPDOWN);
  if (boardsEl) {
    topics.push({
      id: 'home_tour_slp_boards', el: boardsEl, on: 'bottom', padded: true,
      menuLabel: i18n.t('home_tour_slp_boards_label', "Boards and favorites"),
      title: i18n.t('home_tour_slp_boards_title', "Your boards and favorites"),
      text: tourChecklist([
        i18n.t('home_tour_slp_boards_b1', "Boards has your own boards and your favorites"),
        i18n.t('home_tour_slp_boards_b2', "Favorite a board to keep it one tap away"),
        i18n.t('home_tour_slp_boards_b3', "Browse and create boards for your communicators")
      ])
    });
  }
  var caseloadEl = visibleEl('.md-card--caseload') || visibleEl('.md-pillnav [data-tour-pill="caseload"]');
  if (caseloadEl) {
    topics.push({
      id: 'home_tour_slp_caseload', el: caseloadEl, on: 'bottom',
      menuLabel: i18n.t('home_tour_slp_caseload_label', "Your caseload"),
      title: i18n.t('home_tour_slp_caseload_title', "Your caseload"),
      text: tourChecklist([
        i18n.t('home_tour_slp_caseload_b1', "Every communicator you support, in one list"),
        i18n.t('home_tour_slp_caseload_b2', "Open one to see their goals, reports and boards")
      ])
    });
  }
  var modelEl = visibleEl('.md-pillnav [data-tour-pill="caseload"]') || visibleEl(NAV_DROPDOWN);
  if (modelEl) {
    topics.push({
      id: 'home_tour_slp_model', el: modelEl, on: 'bottom', padded: true,
      menuLabel: i18n.t('home_tour_slp_model_label', "Model"),
      title: i18n.t('home_tour_slp_model_title', "Model on their board"),
      text: tourChecklist([
        i18n.t('home_tour_slp_model_b1', "On Caseload, press Model next to a communicator"),
        i18n.t('home_tour_slp_model_b2', "Their board opens so you can show words as you talk"),
        i18n.t('home_tour_slp_model_b3', "Model needs a home board set for that communicator")
      ])
    });
  }
  var dashEl = visibleEl('.md-card--attention') || visibleEl('.md-card--rooms');
  if (dashEl) {
    topics.push({
      id: 'home_tour_slp_dashboards', el: dashEl, on: 'top', last: true,
      menuLabel: i18n.t('home_tour_slp_dash_label', "Your dashboards"),
      title: i18n.t('home_tour_slp_dash_title', "Your dashboards"),
      text: tourChecklist([
        i18n.t('home_tour_slp_dash_b1', "Communicators Need Attention shows who to follow up with"),
        i18n.t('home_tour_slp_dash_b2', "Rooms takes you into a room and its communicators"),
        i18n.t('home_tour_slp_dash_b3', "You can take this tour again from the Take a tour button")
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
  // The last spotlight finishes the tour; there is no separate outro (2026-10-12: five steps in all).
  if (t.last) {
    step.buttons = [step.buttons[0], {
      text: i18n.t('home_tour_done', "Got it"),
      action: function() { return this.complete(); },
      classes: 'md-tour__btn md-tour__btn--primary'
    }];
  }
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
    text: doneCelebration() + tourChecklist(summaryItems(), null,
      i18n.t('home_tour_menu_done_text', "Refreshed on the Home Page. You can reopen this menu anytime from the Take a tour button.")),
    classes: 'md-tour__step md-tour__step--intro md-tour__step--outro',
    // No board-picker link when there is no picker to go to (a supporter, 2026-10-12).
    buttons: (onPickBoard ? [
      {
        text: i18n.t('home_tour_goto_board_picker', "Go to your board picker (page-set)"),
        classes: 'md-tour__btn md-tour__btn--board-link',
        action: function() { this.complete(); onPickBoard(); }
      }
    ] : []).concat([
      {
        text: i18n.t('home_tour_finish', "Finish"),
        type: 'next',
        classes: 'md-tour__btn md-tour__btn--primary'
      }
    ])
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
// `options.supporter` picks the supporter tour; `options.menu` (set for
// returning users who've already completed this tour) swaps the linear walkthrough
// for the topic MENU; if no topic resolves it falls back to the linear tour.
function buildHomeSteps(layout, options) {
  options = options || {};
  // A COMMUNICATOR (not a supporter) gets the one-card welcome; their tour runs on their board (2026-10-12).
  if (!options.supporter) {
    var welcome = communicatorWelcomeStep(false);
    if (layout === 'focused') { welcome.classes += ' md-tour__step--focused'; }
    return [welcome];
  }
  if (options.menu) {
    var menuSteps = buildHomeMenuSteps(layout, options);
    if (menuSteps) { return menuSteps; }
  }
  // A SUPPORTER (an SLP): five steps (2026-10-12, "5 steps with a welcome"): the welcome, then one
  // spotlight per SLP topic, the last one finishing the tour.
  var steps = [welcomeStep()];
  menuTopics().forEach(function(t) { steps.push(tourTopicStep(t)); });
  // Focused View: tag every step so the popover picks up the Focused-View skin
  // (Focused palette + gradient CTA) — see `.md-tour__step--focused` in app.scss.
  if (layout === 'focused') {
    steps.forEach(function(s) {
      s.classes = ((s.classes || '') + ' md-tour__step--focused').trim();
    });
  }
  return steps;
}

export { buildHomeSteps, navPillSummary, communicatorWelcomeStep };
export default buildHomeSteps;
