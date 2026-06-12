import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { alias } from '@ember/object/computed';
import { observer } from '@ember/object';
import { scheduleOnce } from '@ember/runloop';
import i18n from '../utils/i18n';

// — Shepherd step lifecycle helpers (module scope) —
// These run with `this` bound to the active Shepherd Step (the
// `when` handlers below pass the step as context), so they take the
// step explicitly where needed and stay free of component state.

// Inject a decorative progress dot row into a step's footer. Dots are
// purely visual (aria-hidden) — the real navigation is the footer
// buttons, so screen-reader users are never gated on the dots. Count
// and current index are derived live from the tour's step list, so the
// indicator stays correct as supporter-/org-gated steps come and go.
function _renderTourProgress(step) {
  if (!step || !step.el) { return; }
  var steps = (step.tour && step.tour.steps) || [];
  var total = steps.length;
  var idx = steps.indexOf(step);
  if (total <= 1 || idx < 0) { return; }
  var footer = step.el.querySelector('.shepherd-footer');
  if (!footer || footer.querySelector('.md-tour__progress')) { return; }
  var wrap = document.createElement('div');
  wrap.className = 'md-tour__progress';
  wrap.setAttribute('aria-hidden', 'true');
  for (var i = 0; i < total; i++) {
    var dot = document.createElement('span');
    var cls = 'md-tour__progress-dot';
    if (i === idx) { cls += ' is-active'; }
    else if (i < idx) { cls += ' is-done'; }
    dot.className = cls;
    wrap.appendChild(dot);
  }
  footer.insertBefore(wrap, footer.firstChild);
}

// Toggle a body-level flag for the centered (intro/outro) steps so the
// "paused" backdrop blur can be scoped to them in CSS. Attached steps
// (those with an `attachTo` element) deliberately keep a crisp,
// unblurred spotlight on the highlighted card.
function _onTourStepShow() {
  var step = this;
  try {
    var attach = step.options && step.options.attachTo;
    var centered = !(attach && attach.element);
    document.body.classList.toggle('md-tour--centered-step', !!centered);
  } catch (e) { /* class toggle is decorative — never block the step */ }
  try { _renderTourProgress(step); } catch (e) { /* progress is decorative */ }
  // Match the spotlight cutout's corner radius to the highlighted
  // element's OWN border-radius so the opening reads as the same shape as
  // the element (a pill nav as a pill, a card as a rounded rectangle)
  // instead of a fixed 14px rounded rect. The radius is clamped to half the
  // element's shorter side so a large/pill radius resolves to a true pill.
  // Shepherd captures the radius inside its rAF positioning loop, so we set
  // it then re-run setupForStep (which cancels the old loop and restarts
  // with the matched radius — no flicker, no leak).
  try {
    var attachTo = step.options && step.options.attachTo;
    var target = step.target;
    if (!target && attachTo && typeof attachTo.element === 'string') {
      target = document.querySelector(attachTo.element);
    }
    var modal = step.tour && step.tour.modal;
    if (target && modal && typeof modal.setupForStep === 'function') {
      var rect = target.getBoundingClientRect();
      var declaredRadius = parseFloat(window.getComputedStyle(target).borderTopLeftRadius) || 0;
      var matchedRadius = Math.max(0, Math.min(declaredRadius, rect.width / 2, rect.height / 2));
      step.options.modalOverlayOpeningRadius = matchedRadius;
      modal.setupForStep(step);
    }
  } catch (e) { /* shape match is decorative — never block the step */ }
}

function _clearTourCenteredClass() {
  try { document.body.classList.remove('md-tour--centered-step'); } catch (e) { /* noop */ }
}

// Single-responsibility wrapper around the `tour` service from
// ember-shepherd. Owns the home-page step script, the trigger
// button, and the visual/behavioral defaults that match the
// modern dashboard's design language.
//
// The component renders only the trigger; Shepherd portals the
// step popovers and modal overlay into <body> at run time.
export default Component.extend({
  tagName: '',

  appState: service('app-state'),
  app_state: alias('appState'),
  tour: service('tour'),
  router: service('router'),

  // Auto-fire the tour when `appState.auto_open_home_tour` is
  // flipped to true — set by terms-agree confirm for newly-
  // registered users who are skipping the full setup wizard intro
  // (per the home_tour flow). The observer clears the flag on
  // start so subsequent renders don't re-fire. After the auto-
  // opened tour completes OR is cancelled, the user is routed to
  // the setup wizard in critical mode (`?mode=critical&page=usage`)
  // so they still get the must-have steps (role + home board)
  // — see setup.js `critical_order`. A `scheduleOnce('afterRender',
  // ...)` wrapper gives the terms-agree modal time to finish its
  // close animation before the tour overlay paints — otherwise
  // the two overlays cross-fade and look broken.
  _autoOpenWatcher: observer('appState.auto_open_home_tour', function() {
    if (this.get('appState.auto_open_home_tour')) {
      this.appState.set('auto_open_home_tour', false);
      this._scheduleAutoOpen();
    }
  }),

  // Also check on mount in case the flag was already true when the
  // component first inserts (e.g., a route transition raced the
  // observer registration). Idempotent with the observer above —
  // whichever fires first clears the flag.
  //
  // Two signals are checked, in order:
  //   1. `appState.auto_open_home_tour` — in-memory flag, set by
  //      terms-agree confirm (existing flow) and the SPA-fast-path
  //      register save_done.
  //   2. `sessionStorage['ll_auto_open_home_tour']` — cross-reload
  //      flag, set after the beta-welcome flow completes, or directly
  //      by register save_done when the new user has no beta access
  //      (see register.js). session.override() hard-reloads to `/`
  //      (which wipes the in-memory flag), so this survives the reload.
  //      Read and cleared atomically so a subsequent dashboard mount
  //      doesn't re-fire.
  // A third signal, `sessionStorage['ll_pending_beta_welcome']`, is NOT
  // read here — it's consumed by index.js afterModel to route beta users
  // through the beta-welcome flow BEFORE this tour ever auto-opens.
  didInsertElement: function() {
    this._super.apply(this, arguments);
    if (this.get('appState.auto_open_home_tour')) {
      this.appState.set('auto_open_home_tour', false);
      this._scheduleAutoOpen();
      return;
    }
    try {
      if (window.sessionStorage && sessionStorage.getItem('ll_auto_open_home_tour') === '1') {
        sessionStorage.removeItem('ll_auto_open_home_tour');
        this._scheduleAutoOpen();
      }
    } catch (e) { /* sessionStorage unavailable — fall through */ }
  },

  _scheduleAutoOpen: function() {
    var _this = this;
    scheduleOnce('afterRender', this, function() {
      _this._startTour({
        afterComplete: function() {
          // Tour finished (Finish button) OR was closed early
          // (cancel icon / Esc / Skip tour button). Either way,
          // hand the user off to the critical-mode wizard so the
          // remaining must-have step (home board pick) still
          // happens. We do NOT skip this on early-close: the
          // wizard is what makes the app usable post-setup; the
          // tour was just orientation.
          //
          // Starting page is `board_category` — first entry in
          // setup.js `critical_order` since the `usage` step was
          // removed 2026-05-28.
          _this.router.transitionTo('setup', {
            queryParams: { mode: 'critical', page: 'board_category' }
          });
        }
      });
    });
  },

  // Standard back/next pair used on every interior step. Bound to
  // the active service via ember-shepherd's `makeButton`, which
  // intercepts `type` and wires the callback automatically.
  _standardButtons: function() {
    return [
      {
        text: i18n.t('home_tour_back', "Back"),
        type: 'back',
        classes: 'md-tour__btn md-tour__btn--ghost'
      },
      {
        text: i18n.t('home_tour_next', "Next"),
        type: 'next',
        classes: 'md-tour__btn md-tour__btn--primary'
      }
    ];
  },

  // Build the decorated header HTML for the centered intro/outro
  // steps: an "identity bar" eyebrow pill above the heading, giving
  // the tutorial a product-tour identity instead of a generic modal
  // title. Shepherd renders `title` via innerHTML (shepherd.js
  // 14.5.1), so an HTML string is the supported way to do this; the
  // pieces come from i18n only, never user input.
  _decoratedTitle: function(headingKey, headingDefault) {
    var eyebrow = i18n.t('home_tour_eyebrow', "Guided Tour");
    var heading = i18n.t(headingKey, headingDefault);
    var spark = '<svg class="md-tour__eyebrow-icon" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l1.7 5.1 5.1 1.7-5.1 1.7L12 16.1l-1.7-5.1L5.2 9.3l5.1-1.7z"/><path d="M19 13.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" opacity="0.7"/></svg>';
    return '<span class="md-tour__eyebrow">' + spark +
           '<span class="md-tour__eyebrow-text">' + eyebrow + '</span></span>' +
           '<span class="md-tour__heading">' + heading + '</span>';
  },

  _buildSteps: function() {
    var standardButtons = this._standardButtons();
    var supporter = !!this.get('appState.sessionUser.supporter_role');
    // Gate the orgs step on the actual rendered DOM, not on a
    // computed property. The dashboard component has its own
    // `has_management_responsibility` (managed_orgs OR
    // supporter_role) that diverges from the user-model computed
    // (managed_orgs only). Using a DOM presence check keeps the
    // tour in sync with whatever the dashboard actually shows,
    // regardless of which definition is authoritative — and stays
    // correct if the visibility logic changes in either place.
    var orgCardVisible = !!document.querySelector('.md-card--org-management');

    // On narrow viewports (<=1024px) the left/right-attached card
    // popovers run out of horizontal room and overlap the nav/cards.
    // Place those BELOW the element instead, so the card sits under its
    // target with the arrow on the top edge (data-popper-placement=
    // bottom -> arrow top; see the .shepherd-arrow rules in app.scss).
    // Below reads more naturally than above and avoids the card's drop
    // shadow falling over the highlighted element. Top-of-page targets
    // (the nav + its pills) are already 'bottom' at every width. Popper
    // flips automatically if a placement can't fit.
    var narrowTour = (typeof window !== 'undefined') && window.innerWidth <= 1024;
    var side = function(wide) { return narrowTour ? 'bottom' : wide; };

    // The caseload + speak cards render DUAL markup: a `<base>-wide-only` and
    // a `<base>-narrow-only` element BOTH carry the base class. The CSS now
    // ALWAYS shows the -narrow-only (card-as-button) variant at every width
    // and hides -wide-only everywhere, so always target -narrow-only. A bare
    // base selector would grab the FIRST in DOM order (the hidden -wide-only),
    // detaching the popover/spotlight to a corner. (LEARNINGS: "dual
    // wide-only/narrow-only markups share a base class — querySelector(base)
    // grabs the hidden one".) boards/extras/orgs are single-markup and
    // targeted by their base class directly below.
    var cardSel = function(base) {
      return base + '-narrow-only';
    };

    // Per-step responsive config the resize handler (_onTourResize) uses to
    // recompute the placement side AND (for the dual-markup cards) the
    // visible-variant target selector live when the viewport crosses 1024px.
    // `wide` is the >1024px side (narrow always uses 'bottom'); `cardBase`
    // marks the dual-markup cards whose target selector must also flip. The
    // nav + per-pill steps stay 'bottom' at every width, so they are
    // intentionally NOT listed.
    this._tourStepCfg = {
      home_tour_caseload: { wide: 'right', cardBase: '.md-card--caseload' },
      home_tour_speak:    { wide: 'right', cardBase: '.md-card--speak' },
      home_tour_boards:   { wide: 'left' },
      home_tour_extras:   { wide: 'left' },
      home_tour_orgs:     { wide: 'left' }
    };
    this._tourNarrow = narrowTour;

    var steps = [];

    // Step 1 — intro (centered, no attachTo)
    steps.push({
      id: 'home_tour_welcome',
      title: this._decoratedTitle('home_tour_welcome_title', "Welcome to LingoLinq"),
      text: i18n.t('home_tour_welcome_text', "Explore your dashboard and learn where your tools, boards, and communication features live."),
      classes: 'md-tour__step md-tour__step--intro',
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
    });

    // Step 2 — primary nav
    steps.push({
      id: 'home_tour_pillnav',
      attachTo: { element: '.md-pillnav', on: 'bottom' },
      title: i18n.t('home_tour_nav_title', "Your main navigation"),
      text: i18n.t('home_tour_nav_text', "Switch between Home, Boards, Reports, and Extras from this top nav."),
      classes: 'md-tour__step',
      buttons: standardButtons
    });

    // Steps 2b-2e — one explainer per nav pill (Home / Boards / Reports /
    // Extras). Only added when the pill row is actually on-screen — it
    // collapses to a single dropdown on very narrow layouts, and we must
    // never attach a step to a hidden element. The spotlighted pill is
    // styled active for the duration of its step via
    // `.md-pillnav__pill.shepherd-target` in app.scss; this is a purely
    // visual cue — the tour does NOT change tabs/routes. Keys are static
    // literals (not a loop with bound keys) so i18n_generator.rb can
    // extract them — see LEARNINGS.md on the static-parser gotcha. Pills
    // sit at the top of the page, so 'bottom' placement is correct at
    // every width.
    var firstPill = document.querySelector('.md-pillnav .md-pillnav__pill');
    if (firstPill && firstPill.offsetParent !== null) {
      steps.push({
        id: 'home_tour_pill_home',
        attachTo: { element: '.md-pillnav .md-pillnav__pill:nth-of-type(1)', on: 'bottom' },
        title: i18n.t('home_tour_page_home_title', "Home"),
        text: i18n.t('home_tour_page_home_text', "Your dashboard home — pick up where you left off, open Speak Mode, and reach your most-used tools at a glance."),
        classes: 'md-tour__step',
        buttons: standardButtons
      });
      steps.push({
        id: 'home_tour_pill_boards',
        attachTo: { element: '.md-pillnav .md-pillnav__pill:nth-of-type(2)', on: 'bottom' },
        title: i18n.t('home_tour_page_boards_title', "Boards"),
        text: i18n.t('home_tour_page_boards_text', "Browse, create, and organize your communication boards (page-sets). Open any board to view or edit it."),
        classes: 'md-tour__step',
        buttons: standardButtons
      });
      steps.push({
        id: 'home_tour_pill_reports',
        attachTo: { element: '.md-pillnav .md-pillnav__pill:nth-of-type(3)', on: 'bottom' },
        title: i18n.t('home_tour_page_reports_title', "Reports"),
        text: i18n.t('home_tour_page_reports_text', "Track usage and progress — communication activity and word data for the people you support."),
        classes: 'md-tour__step',
        buttons: standardButtons
      });
      steps.push({
        id: 'home_tour_pill_extras',
        attachTo: { element: '.md-pillnav .md-pillnav__pill:nth-of-type(4)', on: 'bottom' },
        title: i18n.t('home_tour_page_extras_title', "Extras"),
        text: i18n.t('home_tour_page_extras_text', "Games, lessons, account settings, and other helpful tools live here whenever you need them."),
        classes: 'md-tour__step',
        buttons: standardButtons
      });
    }

    // Step 3 — caseload (supporter_role only — see LEARNINGS.md
    // canonical communicator gate: !supporter_role)
    if (supporter) {
      steps.push({
        id: 'home_tour_caseload',
        attachTo: { element: cardSel('.md-card--caseload'), on: side('right') },
        title: i18n.t('home_tour_caseload_title', "Your caseload"),
        text: i18n.t('home_tour_caseload_text', "Jump straight to the people you support. Add a note, run a quick assessment, or model in speak mode."),
        classes: 'md-tour__step',
        buttons: standardButtons
      });
    }

    // Step 4 — Speak Mode card
    steps.push({
      id: 'home_tour_speak',
      attachTo: { element: cardSel('.md-card--speak'), on: side('right') },
      title: i18n.t('home_tour_speak_title', "Open Speak Mode"),
      text: i18n.t('home_tour_speak_text', "Continue Speaking opens your home board in communication mode, ready for everyday use."),
      classes: 'md-tour__step',
      buttons: standardButtons
    });

    // Step 5 — Boards card
    steps.push({
      id: 'home_tour_boards',
      attachTo: { element: '.md-card--boards', on: side('left') },
      title: i18n.t('home_tour_boards_title', "Manage your boards"),
      text: i18n.t('home_tour_boards_text', "Create, browse, and organize boards. Your home board is pinned at the front of the strip."),
      classes: 'md-tour__step',
      buttons: standardButtons
    });

    // Step 6 — Extras card
    steps.push({
      id: 'home_tour_extras',
      attachTo: { element: '.md-card--extras', on: side('left') },
      title: i18n.t('home_tour_extras_title', "More tools in Extras"),
      text: i18n.t('home_tour_extras_text', "Find games, lessons, account settings, and more under Extras whenever you need them."),
      classes: 'md-tour__step',
      buttons: standardButtons
    });

    // Step 7 — My Organizations (only when the dashboard card is
    // actually rendered — see the DOM-presence check at the top
    // of this method for why we gate on the element instead of a
    // computed)
    if (orgCardVisible) {
      steps.push({
        id: 'home_tour_orgs',
        attachTo: { element: '.md-card--org-management', on: side('left') },
        title: i18n.t('home_tour_orgs_title', "Manage your organizations"),
        text: i18n.t('home_tour_orgs_text', "If you administer one or more LingoLinq organizations, jump in here to manage members, rooms, and licenses."),
        classes: 'md-tour__step',
        buttons: standardButtons
      });
    }

    // Step 8 — outro (centered, single Finish button — type:next on the
    // last step completes the tour via Shepherd's auto-complete)
    steps.push({
      id: 'home_tour_done',
      title: this._decoratedTitle('home_tour_done_title', "You're all set"),
      text: i18n.t('home_tour_done_text', "That's the tour. You can revisit it anytime from the Take a tour button at the top of the dashboard."),
      classes: 'md-tour__step md-tour__step--intro',
      buttons: [
        {
          text: i18n.t('home_tour_finish', "Finish"),
          type: 'next',
          classes: 'md-tour__btn md-tour__btn--primary'
        }
      ]
    });

    return steps;
  },

  // Common tour-start path. Used by both the trigger-button action
  // (manual entry) and the auto-open path (post-registration). The
  // `afterComplete` option, when provided, is bound to BOTH the
  // shepherd Tour's `complete` and `cancel` events so the caller
  // can hand off the user to whatever comes next regardless of how
  // the tour ended.
  _startTour: function(options) {
    options = options || {};
    var _this = this;
    var tour = this.get('tour');
    if(!tour) { return; }

    // Defaults applied to every step. Per ember-shepherd docs these
    // MUST be set before addSteps() so Shepherd picks them up when
    // instantiating each step.
    tour.set('confirmCancel', false);
    tour.set('modal', true);
    tour.set('defaultStepOptions', {
      classes: 'md-tour__step',
      cancelIcon: { enabled: true },
      // INSTANT scroll (not 'smooth'): Shepherd computes a step's
      // position BEFORE its scroll settles, and floating-ui's flip()
      // middleware then re-picks top/bottom from available space. With a
      // smooth (~300ms) scroll the target starts low in the viewport, so
      // the popover paints ABOVE, then flips BELOW once the scroll
      // centers it — a visible above->below flash (e.g. Speak -> Boards).
      // An instant scroll centers the target in one frame, so flip()
      // computes once at the final position and the flash is gone.
      scrollTo: { behavior: 'auto', block: 'center' },
      // 0 padding: the dark overlay hugs the highlighted component exactly,
      // so no light page background shows as a distracting "outer container"
      // around it — the user sees the component as it really is. The glow
      // (`.shepherd-target` in app.scss) supplies the emphasis instead.
      modalOverlayOpeningPadding: 0,
      modalOverlayOpeningRadius: 14,
      // Per-step show hook: paints the progress dots and flags the
      // centered intro/outro steps so the backdrop blur scopes to
      // them (see _onTourStepShow). Steps don't define their own
      // `when`, so this default applies to every step.
      when: { show: _onTourStepShow }
    });

    tour.addSteps(this._buildSteps()).then(function() {
      // After addSteps resolves, `tour.tourObject` is the actual
      // shepherd Tour instance. The ember-shepherd service's
      // own Evented forwards method-triggered events (back, next)
      // but NOT shepherd-native lifecycle events (complete,
      // cancel) — wire those on the underlying Tour directly.
      if (tour.tourObject) {
        // Always tidy the body-level centered-step flag when the
        // tour ends, however it ends.
        tour.tourObject.on('complete', _clearTourCenteredClass);
        tour.tourObject.on('cancel', _clearTourCenteredClass);
        // Re-evaluate card placements live on viewport resize (flip
        // between the wide side and 'top' when crossing 1024px), and
        // remove the listener when the tour ends so it can't leak.
        _this._attachTourResize();
        tour.tourObject.on('complete', function() { _this._detachTourResize(); });
        tour.tourObject.on('cancel', function() { _this._detachTourResize(); });
      }
      if (options.afterComplete && tour.tourObject) {
        tour.tourObject.on('complete', options.afterComplete);
        tour.tourObject.on('cancel', options.afterComplete);
      }
      tour.start();
    });
  },

  // Attach a debounced window-resize listener that re-evaluates card
  // placements when the viewport crosses the 1024px boundary mid-tour.
  // Idempotent — a second call is a no-op while one is already attached.
  _attachTourResize: function() {
    if (this._tourResizeHandler) { return; }
    var _this = this;
    this._tourResizeHandler = function() { _this._onTourResize(); };
    window.addEventListener('resize', this._tourResizeHandler);
  },

  _detachTourResize: function() {
    if (this._tourResizeHandler) {
      window.removeEventListener('resize', this._tourResizeHandler);
      this._tourResizeHandler = null;
    }
  },

  // On resize: if the narrow/wide state changed, flip every flippable
  // step's placement (wide side <-> 'top') and re-show the currently
  // open step so Floating UI repositions it at the new placement. The
  // cheap early-return on an unchanged boundary keeps this safe to call
  // on every resize tick without debouncing.
  _onTourResize: function() {
    var tour = this.get('tour');
    var obj = tour && tour.tourObject;
    if (!obj) { return; }
    var narrow = window.innerWidth <= 1024;
    if (narrow === this._tourNarrow) { return; }
    this._tourNarrow = narrow;
    var cfg = this._tourStepCfg || {};
    (obj.steps || []).forEach(function(step) {
      var id = step.id || (step.options && step.options.id);
      var opts = step.options || {};
      var c = cfg[id];
      if (opts.attachTo && c) {
        opts.attachTo.on = narrow ? 'bottom' : c.wide;
        // Dual-markup cards (caseload/speak) always show the -narrow-only
        // as-button variant now (the -wide-only is no longer displayed at any
        // width), so always target it — only the placement side flips.
        if (c.cardBase) {
          opts.attachTo.element = c.cardBase + '-narrow-only';
        }
      }
    });
    // Re-show the active step so the new placement takes effect. Guarded
    // because getCurrentStep/isOpen vary across shepherd versions.
    var current = obj.getCurrentStep && obj.getCurrentStep();
    if (current && typeof current.show === 'function') {
      if (typeof current.isOpen !== 'function' || current.isOpen()) {
        current.show();
      }
    }
  },

  // Safety net: if the component is torn down while the tour is open
  // (route change, etc.), make sure the resize listener is removed.
  willDestroyElement: function() {
    this._detachTourResize();
    this._super.apply(this, arguments);
  },

  actions: {
    startTour: function() {
      this._startTour();
    }
  }
});
