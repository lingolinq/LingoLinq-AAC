import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { alias } from '@ember/object/computed';
import { observer } from '@ember/object';
import { scheduleOnce } from '@ember/runloop';
import i18n from '../utils/i18n';

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
  //      flag, set after beta welcome completes or when registration
  //      skips beta welcome (see register.js save_done).
  //   3. `sessionStorage['ll_pending_beta_welcome']` — consumed by
  //      index.js afterModel to route to beta welcome before this tour.
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

    var steps = [];

    // Step 1 — intro (centered, no attachTo)
    steps.push({
      id: 'home_tour_welcome',
      title: i18n.t('home_tour_welcome_title', "Welcome to LingoLinq"),
      text: i18n.t('home_tour_welcome_text', "Here's a quick tour of your dashboard so you know where everything lives. You can close this anytime."),
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

    // Step 3 — caseload (supporter_role only — see LEARNINGS.md
    // canonical communicator gate: !supporter_role)
    if (supporter) {
      steps.push({
        id: 'home_tour_caseload',
        attachTo: { element: '.md-card--caseload', on: 'right' },
        title: i18n.t('home_tour_caseload_title', "Your caseload"),
        text: i18n.t('home_tour_caseload_text', "Jump straight to the people you support. Add a note, run a quick assessment, or model in speak mode."),
        classes: 'md-tour__step',
        buttons: standardButtons
      });
    }

    // Step 4 — Speak Mode card
    steps.push({
      id: 'home_tour_speak',
      attachTo: { element: '.md-card--speak', on: 'right' },
      title: i18n.t('home_tour_speak_title', "Open Speak Mode"),
      text: i18n.t('home_tour_speak_text', "Continue Speaking opens your home board in communication mode, ready for everyday use."),
      classes: 'md-tour__step',
      buttons: standardButtons
    });

    // Step 5 — Boards card
    steps.push({
      id: 'home_tour_boards',
      attachTo: { element: '.md-card--boards', on: 'left' },
      title: i18n.t('home_tour_boards_title', "Manage your boards"),
      text: i18n.t('home_tour_boards_text', "Create, browse, and organize boards. Your home board is pinned at the front of the strip."),
      classes: 'md-tour__step',
      buttons: standardButtons
    });

    // Step 6 — Extras card
    steps.push({
      id: 'home_tour_extras',
      attachTo: { element: '.md-card--extras', on: 'left' },
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
        attachTo: { element: '.md-card--org-management', on: 'left' },
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
      title: i18n.t('home_tour_done_title', "You're all set"),
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
      scrollTo: { behavior: 'smooth', block: 'center' },
      modalOverlayOpeningPadding: 8,
      modalOverlayOpeningRadius: 14
    });

    tour.addSteps(this._buildSteps()).then(function() {
      // After addSteps resolves, `tour.tourObject` is the actual
      // shepherd Tour instance. The ember-shepherd service's
      // own Evented forwards method-triggered events (back, next)
      // but NOT shepherd-native lifecycle events (complete,
      // cancel) — wire those on the underlying Tour directly.
      if (options.afterComplete && tour.tourObject) {
        tour.tourObject.on('complete', options.afterComplete);
        tour.tourObject.on('cancel', options.afterComplete);
      }
      tour.start();
    });
  },

  actions: {
    startTour: function() {
      this._startTour();
    }
  }
});
