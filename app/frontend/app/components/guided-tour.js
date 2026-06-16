import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { alias } from '@ember/object/computed';
import { observer, computed } from '@ember/object';
import { scheduleOnce, later as runLater } from '@ember/runloop';
import i18n from '../utils/i18n';
import { tourBuilderFor, tourKeyFor } from '../utils/tours/registry';
import { placementForElement, setIdentityDropdownOpen, scrollIntoViewSettled } from '../utils/tours/shared';

// Apply "smooth scroll, THEN show" to every ATTACHED step of a built tour, so
// the spotlight glides to each target and the popover is positioned once at the
// settled spot (no mid-scroll flip-flash). Done at the runner level so EVERY tour
// (home, board-picker, future) gets it from one place — step builders don't have
// to wire it themselves. For each step with an attachTo element: disable
// Shepherd's own (post-show) scrollTo and move the scroll into beforeShowPromise,
// composing with any beforeShowPromise the step already declares (e.g. the home
// tour opening the account dropdown before its item steps). Centered steps (no
// attachTo) are left alone. `step.scrollBlock` lets a step force a scroll
// position (e.g. 'start' for a target taller than the popover can sit beside).
function _applySmoothScroll(steps, tour) {
  (steps || []).forEach(function(step) {
    if (!step || !step.attachTo || !step.attachTo.element) { return; }
    var prevBefore = (typeof step.beforeShowPromise === 'function') ? step.beforeShowPromise : null;
    // Disable Shepherd's own (post-show) scrollTo. We instead scroll in the show
    // hook (_scrollHighlightIntoView) AFTER the step shows, so the dimmed page and
    // its spotlight stay visible and TRACK the target as it scrolls into view —
    // the modern "watch the next item glide into the highlight" experience. The
    // popover card is held hidden only during that motion so it can't flip-flash.
    step.scrollTo = false;
    step.beforeShowPromise = function() {
      // Keep the dark scrim CONTINUOUS across the hide→show handoff: the previous
      // step's hide() set modalIsVisible=false; re-set it true now (synchronously,
      // before Svelte flushes the class) so the overlay never blinks bright for a
      // frame. Do NOT closeModalOpening here — we want the spotlight to stay and
      // track, not flatten. The tour is captured because Shepherd calls
      // beforeShowPromise with `this` = the step OPTIONS, not the Step.
      try {
        var modal = tour && tour.tourObject && tour.tourObject.modal;
        if (modal && typeof modal.show === 'function') { modal.show(); }
      } catch (e) { /* overlay continuity is best-effort */ }
      return prevBefore ? Promise.resolve(prevBefore()) : Promise.resolve();
    };
  });
}

// Show hook helper: gently scroll the step's target into view with the spotlight
// visible (the dimmed page is the user's constant reference), holding the popover
// card hidden during the motion so floating-ui's flip() can't flash it; fade it
// in once the target settles. Already-on-screen targets show immediately (unless
// the step forces a scroll position via `scrollBlock`, e.g. the board-picker card
// that must scroll to the top so its below-popover fits).
function _scrollHighlightIntoView(step) {
  var el = step && step.el;
  if (!el) { return; }
  // Hide the incoming card, gently scroll its target into view (slow), THEN fade
  // it in. Done for EVERY step so each one fades in the same gentle way (the card
  // entrance is a pure opacity fade now — no slide/scale). Centered steps (no
  // target) just fade in.
  el.classList.add('md-tour__step--revealing');
  var reveal = function() {
    if (!el) { return; }
    // Fade the card in immediately. The "revealing" class hid it with
    // transition:none; just removing the class and relying on the base opacity
    // transition does NOT reliably start the fade (Blink skips a transition when
    // transition-property flips from none in the same frame), which left the card
    // sitting hidden for a beat. So drive it explicitly: commit opacity:0 with a
    // forced reflow, then transition to 1. Inline styles are cleared after.
    el.classList.remove('md-tour__step--revealing');
    el.style.transition = 'none';
    el.style.opacity = '0';
    void el.offsetWidth;                       // commit the opacity:0 frame
    el.style.transition = 'opacity 0.45s ease';
    el.style.opacity = '1';
    window.setTimeout(function() {
      if (el) { el.style.opacity = ''; el.style.transition = ''; }
    }, 520);
  };
  var target = step.target;
  if (!target) { reveal(); return; }
  var block = (step.options && step.options.scrollBlock) || 'center';
  var force = !!(step.options && step.options.scrollBlock);
  scrollIntoViewSettled(target, block, force).then(reveal);
}

// — Shepherd step lifecycle helpers (module scope) —
// These run with `this` bound to the active Shepherd Step (the `when` handlers
// below pass the step as context), so they take the step explicitly where
// needed and stay free of component state.

// Inject a decorative progress dot row into a step's footer. Dots are purely
// visual (aria-hidden) — the real navigation is the footer buttons, so
// screen-reader users are never gated on the dots. Count and current index are
// derived live from the tour's step list, so the indicator stays correct as
// gated steps come and go.
function _renderTourProgress(step) {
  if (!step || !step.el) { return; }
  var steps = (step.tour && step.tour.steps) || [];
  // Menu mode (returning user) is a hub-and-spoke, not a linear 1..N sequence —
  // the progress dots would misrepresent it, so skip them whenever the tour
  // includes the menu hub.
  var isMenuMode = steps.some(function(s) {
    return (s.id || (s.options && s.options.id)) === 'home_tour_menu';
  });
  if (isMenuMode) { return; }
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
  // The dots are aria-hidden (decorative); give screen-reader users the same
  // orientation with an sr-only "Step X of Y" read when the popover gains focus.
  if (!footer.querySelector('.md-tour__progress-sr')) {
    var srCount = document.createElement('span');
    srCount.className = 'sr-only md-tour__progress-sr';
    srCount.textContent = i18n.t('home_tour_step_counter', "Step %{n} of %{total}", { n: idx + 1, total: total });
    footer.insertBefore(srCount, footer.firstChild);
  }
}

// Toggle a body-level flag for the centered (intro/outro) steps so the "paused"
// backdrop blur can be scoped to them in CSS. Attached steps (those with an
// `attachTo` element) deliberately keep a crisp, unblurred spotlight on the
// highlighted card.
function _onTourStepShow() {
  var step = this;
  try {
    var attach = step.options && step.options.attachTo;
    var centered = !(attach && attach.element);
    document.body.classList.toggle('md-tour--centered-step', !!centered);
  } catch (e) { /* class toggle is decorative — never block the step */ }
  try { _renderTourProgress(step); } catch (e) { /* progress is decorative */ }
  // Smooth "scroll the highlight into view" — keep page + spotlight visible,
  // hold the popover hidden during the motion, fade it in on settle.
  try { _scrollHighlightIntoView(step); } catch (e) { /* reveal is best-effort */ }
  // Account menu: keep it OPEN only for the dropdown ITEM steps (they also force
  // it open via beforeShowPromise before positioning). Close it on every other
  // step — including the identity TRIGGER step, which just spotlights the avatar
  // with the menu still closed.
  try {
    var sid = step.id || (step.options && step.options.id) || '';
    // Keep the account menu OPEN for the linear dropdown-item steps AND for the
    // menu-mode "Account menu" topic (home_tour_t_account), which opens the menu
    // so the user can see what's inside. Close it on every other step.
    var keepDropdownOpen = sid.indexOf('home_tour_iddrop_') === 0 || sid === 'home_tour_t_account';
    if (!keepDropdownOpen) { setIdentityDropdownOpen(false); }
  } catch (e) { /* dropdown sync is non-critical */ }
  // Match the spotlight cutout's corner radius to the highlighted element's OWN
  // border-radius so the opening reads as the same shape as the element (a pill
  // nav as a pill, a card as a rounded rectangle) instead of a fixed 14px
  // rounded rect. The radius is clamped to half the element's shorter side so a
  // large/pill radius resolves to a true pill. Shepherd captures the radius
  // inside its rAF positioning loop, so we set it then re-run setupForStep
  // (which cancels the old loop and restarts with the matched radius — no
  // flicker, no leak).
  try {
    // A step can opt OUT of target-radius matching (matchTargetRadius:false) to
    // keep its OWN stylized overlay — a padded, rounded cutout that wraps a
    // square element (e.g. the full-width header bar) instead of a tight square.
    // Shepherd already applied the step's modalOverlayOpeningPadding/Radius when
    // it showed, so we just leave them be.
    if (step.options && step.options.matchTargetRadius === false) { return; }
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

// Return the user to the top of the page when the tour ends — its `scrollTo`
// (block:center) leaves the dashboard scrolled to wherever the last card sat.
// Mirrors the dashboard's own scroll-to-top (the page scrolls inside #content
// AND/OR the window depending on layout, so reset both).
function _scrollTourToTop() {
  try {
    var content = document.getElementById('content');
    if (content) { content.scrollTop = 0; }
    window.scrollTo(0, 0);
  } catch (e) { /* scroll reset is non-critical */ }
}

// Generic guided-tour runner + dispatcher. Owns the trigger button and the
// Shepherd visual/behavioral defaults; the actual step script is chosen
// per-page (route + dashboard layout) by utils/tours/registry, so the one
// inner-header button pulls a PAGE-SPECIFIC tour. The component renders only
// the trigger; Shepherd portals the step popovers and modal overlay into
// <body> at run time.
export default Component.extend({
  tagName: '',

  appState: service('app-state'),
  app_state: alias('appState'),
  tour: service('tour'),
  router: service('router'),

  // The dashboard layout actually in effect — mirrors
  // dashboard/authenticated-view's effectiveLayout (default 'gentle'; any
  // unset/legacy value resolves to it). Used to pick the per-layout tour.
  effectiveLayout: computed('appState.currentUser.preferences.dashboard_layout', function() {
    var layout = this.get('appState.currentUser.preferences.dashboard_layout') || 'gentle';
    if (['gentle', 'focused'].indexOf(layout) === -1) { layout = 'gentle'; }
    return layout;
  }),

  // The step-builder for the current page/layout, or null when no tour exists
  // here. Drives both the trigger visibility (hasTour) and _startTour.
  tourBuilder: computed('appState.current_route', 'effectiveLayout', 'appState.edit_mode', function() {
    return tourBuilderFor(this.get('appState.current_route'), this.get('effectiveLayout'), this.get('appState.edit_mode'));
  }),

  // Only show the trigger when the current page actually has a tour.
  hasTour: computed('tourBuilder', function() {
    return !!this.get('tourBuilder');
  }),

  // Stable completion-flag key for the current page + layout (e.g. 'home_gentle',
  // 'home_focused'), or null. Persisted under
  // preferences.progress.guided_tours_completed once the tour is COMPLETED.
  tourKey: computed('appState.current_route', 'effectiveLayout', 'appState.edit_mode', function() {
    return tourKeyFor(this.get('appState.current_route'), this.get('effectiveLayout'), this.get('appState.edit_mode'));
  }),

  // Whether THIS page+view's tour has been completed at least once — drives the
  // "seen" check badge on the trigger. Reads the saved flag; recomputes when
  // _markTourCompleted sets a fresh preferences object, so the badge appears the
  // moment the user finishes the tour.
  tourSeen: computed('appState.currentUser.preferences.progress.guided_tours_completed', 'tourKey', function() {
    var key = this.get('tourKey');
    if (!key) { return false; }
    var map = this.get('appState.currentUser.preferences.progress.guided_tours_completed') || {};
    return !!map[key];
  }),

  // Auto-fire the tour when `appState.auto_open_home_tour` is flipped to true —
  // set by terms-agree confirm for newly-registered users who are skipping the
  // full setup wizard intro. The observer clears the flag on start so
  // subsequent renders don't re-fire. After the auto-opened tour completes OR is
  // cancelled (OR is skipped because the page has no tour), the user is routed
  // to the setup wizard in critical mode so they still get the must-have steps —
  // see setup.js `critical_order`. A `scheduleOnce('afterRender', ...)` wrapper
  // gives the terms-agree modal time to finish its close animation before the
  // tour overlay paints.
  _autoOpenWatcher: observer('appState.auto_open_home_tour', function() {
    if (this.get('appState.auto_open_home_tour')) {
      this.appState.set('auto_open_home_tour', false);
      this._scheduleAutoOpen();
    }
  }),

  // True only when THIS instance is the board-detail EDIT tour (edit mode on a
  // board-detail route → tourKey 'board_detail_edit_*'). The auto-start guard must
  // use this, NOT a bare `tourBuilder` truthy check: `board_detail_tour_pending`
  // is flipped during "Pick this Board" while the user is STILL on /board-picker,
  // where the navbar guided-tour instance has a (board-PICKER) tourBuilder — a
  // truthy check would let it consume the flag and fire the WRONG tour. Gating on
  // the board-detail-edit tourKey makes only the edit-chrome instance respond.
  _isBoardDetailEditTour: function() {
    return (this.get('tourKey') || '').indexOf('board_detail_edit') === 0;
  },

  // Auto-fire the board-detail EDIT tour when `appState.board_detail_tour_pending`
  // is set — flipped by board-preview "Pick this Board" (and, eventually, the
  // create-board path) right before routing into board-detail edit mode. All three
  // entry points (init, this observer, didInsertElement) funnel into the single
  // poll-based consumer below, which clears the flag once and only on the
  // board-detail edit instance.
  _boardDetailTourWatcher: observer('appState.board_detail_tour_pending', 'tourKey', function() {
    this._consumePendingBoardDetailTour();
  }),

  // This component is `tagName: ''` (tagless), so `didInsertElement` does NOT fire,
  // and the observer above only fires on CHANGE — but `board_detail_tour_pending`
  // is already true (set during "Pick this Board", BEFORE this edit-chrome instance
  // mounts). So init is the reliable entry. init DOES run for tagless components.
  init: function() {
    this._super(...arguments);
    this._consumePendingBoardDetailTour();
  },

  // Consume the pending-edit-tour flag and auto-open the board-detail EDIT tour.
  // ROBUST to timing: the edit-tour condition (appState.edit_mode → tourKey)
  // depends on the .edit route's check_for_needing_purchase() PROMISE resolving —
  // which persists current_mode='edit' (board-detail/edit.js) — and on
  // currentBoardState. Both can land a microtask or two AFTER this tagless
  // instance's init/first afterRender. A single afterRender check therefore often
  // runs before the page is recognizably "board-detail edit" and misses, after
  // which nothing re-triggers — the tour silently never opens (the reported bug).
  // So poll on a bounded schedule until _isBoardDetailEditTour() holds, then
  // consume the flag ONCE and start. The `_bdTourConsuming` guard stops the init +
  // observer triggers from stacking parallel polls.
  _consumePendingBoardDetailTour: function() {
    var _this = this;
    if (this.isDestroyed || this.isDestroying) { return; }
    if (!this.get('appState.board_detail_tour_pending')) { return; }
    if (this._bdTourConsuming) { return; }
    this._bdTourConsuming = true;
    var attempts = 0;
    var tryConsume = function() {
      if (_this.isDestroyed || _this.isDestroying) { _this._bdTourConsuming = false; return; }
      // Another instance/hook may have consumed it first.
      var pending = _this.get('appState.board_detail_tour_pending');
      if (!pending) { _this._bdTourConsuming = false; return; }
      if (_this._isBoardDetailEditTour()) {
        // `pending` carries the COPIED BOARD'S KEY (a string; set by board-preview
        // "Pick this Board"). Fire the edit tour ONLY when the board-detail page this
        // instance mounted on IS that board — so a stale flag can't auto-open the tour
        // on a DIFFERENT board the user navigated to instead. A bare `true` (legacy /
        // no-key fallback) keeps the old "fire on any edit page" behavior.
        if (typeof pending === 'string') {
          var curKey = _this.get('appState.currentBoardState.key');
          if (!curKey) {
            // currentBoardState lands a microtask or two after the route settles —
            // keep polling rather than fire or clear on incomplete state.
            if (attempts++ < 20) { runLater(_this, tryConsume, 150); }
            else { _this._bdTourConsuming = false; }   // give up; leave flag for a later mount
            return;
          }
          if (curKey !== pending) {
            // On a board-detail EDIT page, but NOT the copied board — consume the stale
            // flag WITHOUT firing so it can never auto-open the tour on the wrong board.
            _this._bdTourConsuming = false;
            _this.appState.set('board_detail_tour_pending', false);
            return;
          }
        }
        _this._bdTourConsuming = false;
        _this.appState.set('board_detail_tour_pending', false);
        _this._scheduleBoardDetailAutoOpen();
      } else if (attempts++ < 20) {              // ~3s ceiling (20 × 150ms)
        runLater(_this, tryConsume, 150);
      } else {
        // Not a board-detail edit page after all — stop polling but LEAVE the flag
        // set so a genuine edit-chrome instance can still pick it up later.
        _this._bdTourConsuming = false;
      }
    };
    scheduleOnce('afterRender', this, tryConsume);
  },

  // Also check on mount in case the flag was already true when the component
  // first inserts (e.g., a route transition raced the observer registration).
  // Idempotent with the observer above — whichever fires first clears the flag.
  //
  // Two signals are checked, in order:
  //   1. `appState.auto_open_home_tour` — in-memory flag, set by terms-agree
  //      confirm (existing flow) and the SPA-fast-path register save_done.
  //   2. `sessionStorage['ll_auto_open_home_tour']` — cross-reload flag, set
  //      after the beta-welcome flow completes, or directly by register
  //      save_done when the new user has no beta access (see register.js).
  //      session.override() hard-reloads to `/` (which wipes the in-memory
  //      flag), so this survives the reload. Read and cleared atomically so a
  //      subsequent dashboard mount doesn't re-fire.
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
    // Board-detail edit tour: the pending flag is set BEFORE the route transition
    // into edit mode, so by the time this edit-chrome instance mounts it's already
    // true. Funnel through the poll-based consumer (idempotent via its guard); it
    // waits for the edit-tour condition to settle before firing.
    this._consumePendingBoardDetailTour();
  },

  _scheduleAutoOpen: function() {
    var _this = this;
    scheduleOnce('afterRender', this, function() {
      // Hand the user off to the critical-mode wizard so the remaining
      // must-have step (home board pick) still happens, regardless of how the
      // tour ended. Starting page is `board_category` — first entry in setup.js
      // `critical_order`.
      var handoff = function() {
        _this.router.transitionTo('setup', {
          queryParams: { mode: 'critical', page: 'board_category' }
        });
      };
      // If the current page/layout has no tour (e.g. a newly-registered user on
      // the default Focused View, whose tour isn't built yet), skip the tour but
      // STILL run the handoff so registration's wizard step is never lost.
      if (!_this.get('tourBuilder')) { handoff(); return; }
      _this._startTour({ afterComplete: handoff });
    });
  },

  // Board-detail edit auto-open. Unlike the home auto-open there's NO handoff —
  // the user stays here editing. The edit grid loads asynchronously after the
  // route transition, so wait (poll briefly) until a button cell is on screen so
  // the interior spotlights resolve instead of being skipped; start anyway after
  // a bounded number of attempts so the welcome/outro still show on a slow load.
  _scheduleBoardDetailAutoOpen: function() {
    var _this = this;
    var attempts = 0;
    var tryStart = function() {
      if (_this.isDestroyed || _this.isDestroying) { return; }
      attempts++;
      var ready = document.querySelector('.md-board-detail-grid .md-board-detail-symbol-card') ||
                  document.querySelector('.md-board-detail-grid');
      // BOUNDED — does NOT hang. After ~3s (20 × 150ms) the poll gives up regardless of
      // whether the grid ever appeared (e.g. a network error), so there's no infinite
      // wait (adversarial-review "no timeout" note). Same ceiling guards the consumer.
      if (ready || attempts >= 20) {        // ~3s ceiling (20 × 150ms)
        // Re-confirm we're still the board-detail edit tour before starting (the
        // route could have changed during the poll).
        if (!_this._isBoardDetailEditTour()) { return; }
        _this._startTour();
      } else {
        runLater(_this, tryStart, 150);
      }
    };
    scheduleOnce('afterRender', this, tryStart);
  },

  // Common tour-start path. Used by both the trigger-button action (manual
  // entry) and the auto-open path (post-registration). The `afterComplete`
  // option, when provided, is bound to BOTH the shepherd Tour's `complete` and
  // `cancel` events so the caller can hand off the user to whatever comes next
  // regardless of how the tour ended.
  _startTour: function(options) {
    options = options || {};
    var _this = this;
    var tour = this.get('tour');
    if (!tour) { return; }
    var builder = this.get('tourBuilder');
    if (!builder) { return; }

    // Defaults applied to every step. Per ember-shepherd docs these MUST be set
    // before addSteps() so Shepherd picks them up when instantiating each step.
    tour.set('confirmCancel', false);
    tour.set('modal', true);
    tour.set('defaultStepOptions', {
      classes: 'md-tour__step',
      cancelIcon: { enabled: true },
      // Disable the highlighted element during the tour: Shepherd sets
      // pointer-events:none on the spotlit target so its links/buttons can't be
      // clicked (the spotlight still shows). The tour is driven only by the
      // popover's Back/Next. This is in defaultStepOptions so it's the STANDARD
      // for every step here — and for any future tour built on this runner
      // (gentle or focused alike).
      canClickTarget: false,
      // INSTANT scroll (not 'smooth'): Shepherd computes a step's position
      // BEFORE its scroll settles, and floating-ui's flip() middleware then
      // re-picks top/bottom from available space. With a smooth scroll the
      // target starts low in the viewport, so the popover paints ABOVE, then
      // flips BELOW once the scroll centers it — a visible flash. An instant
      // scroll centers the target in one frame, so flip() computes once at the
      // final position and the flash is gone.
      scrollTo: { behavior: 'auto', block: 'center' },
      // 0 padding: the dark overlay hugs the highlighted component exactly, so
      // no light page background shows as a distracting "outer container" around
      // it. The glow (`.shepherd-target` in app.scss) supplies the emphasis.
      modalOverlayOpeningPadding: 0,
      modalOverlayOpeningRadius: 14,
      // Per-step show hook: paints the progress dots and flags the centered
      // intro/outro steps so the backdrop blur scopes to them (see
      // _onTourStepShow). Steps don't define their own `when`, so this default
      // applies to every step.
      when: { show: _onTourStepShow }
    });

    // The board-picker handoff, returning-user topic MENU, and post-registration
    // setup handoff are all HOME-tour concepts. Scope them to the home tour so
    // OTHER tours built on this runner (board-picker, board-detail edit) get a
    // plain linear walkthrough with no cross-page handoff. (Home behavior is
    // unchanged: isHomeTour is true there.)
    var isHomeTour = (this.get('appState.current_route') === 'user.home');
    // A user who has NOT completed THIS page+layout's tour is "first time" —
    // however the tour was launched (post-registration auto-open OR a manual
    // "Take a tour"). First-timers get the linear walkthrough whose outro previews
    // the board-picker next step AND are handed off to the board picker on finish.
    // A RETURNING user (already completed) launching manually gets the topic MENU.
    var firstTime = !this.get('tourSeen');
    var menuMode = isHomeTour && !firstTime && !options.afterComplete;
    var onPickBoard = function() { _this.router.transitionTo('board-picker'); };
    // Board-picker handoff on the FIRST-TIME finish:
    //  • auto-open (options.afterComplete supplied): the caller's critical-mode
    //    setup handoff, bound below to BOTH complete and cancel — a new user must
    //    reach setup however the tour ends. (Existing behavior, unchanged.)
    //  • manual first-time finish: send them to the standalone board picker, bound
    //    to COMPLETE only — finishing means "now go pick a board"; skipping/closing
    //    the tour should NOT yank them away.
    var firstTimeNav = (isHomeTour && !options.afterComplete && firstTime) ? onPickBoard : null;
    // Options the builder reads:
    //  • handoff — first-time outro: preview the board-picker next step (the green
    //    forward animation + "Pick my board") instead of a dead-end "Finish".
    //  • menu — returning user: swap the linear walkthrough for the topic MENU.
    //  • onPickBoard — the menu-mode outro's "Go to your board picker" link (the
    //    component owns the router, so navigation is supplied here, not in step data).
    var builtSteps = builder(isHomeTour ? {
      handoff: firstTime,
      menu: menuMode,
      onPickBoard: onPickBoard
    } : {});
    // Smooth "scroll then show" for every attached step (runner-level, so all
    // tours share it). Must run BEFORE addSteps so Shepherd instantiates the
    // steps with the injected beforeShowPromise + scrollTo:false. `tour` is
    // captured so the injected hook can keep the overlay dark during the scroll.
    _applySmoothScroll(builtSteps, tour);
    tour.addSteps(builtSteps).then(function() {
      // If the component (or tour) was torn down while addSteps was resolving,
      // don't wire handlers / start against a dead instance.
      if (_this.isDestroyed || _this.isDestroying) { return; }
      // After addSteps resolves, `tour.tourObject` is the actual shepherd Tour
      // instance. The ember-shepherd service's own Evented forwards
      // method-triggered events (back, next) but NOT shepherd-native lifecycle
      // events (complete, cancel) — wire those on the underlying Tour directly.
      if (tour.tourObject) {
        // Fade the OUTGOING card out on hide. Shepherd snaps a step away via the
        // `hidden` attribute; CSS keeps it rendered (app.scss `[hidden]` rule) and
        // this fades its opacity inline (inline beats the cascade reliably). With
        // the incoming card's fade-in (the reveal logic), each transition reads as
        // one card fading out → the next fading in, never a hard snap.
        (tour.tourObject.steps || []).forEach(function(s) {
          if (s && typeof s.on === 'function') {
            s.on('hide', function() {
              try {
                if (!s.el) { return; }
                // Steps anchored to an identity-dropdown MENU ITEM (the home tour's
                // account-menu walkthrough) are a special case: advancing CLOSES the
                // dropdown (next step's show hook → setIdentityDropdownOpen(false)),
                // which removes the very element this popover is anchored to. A
                // popover still mid-fade then has no anchor, so floating-ui flings it
                // to the top-left (0,0) — the "Sign Out card flashes top-left" glitch.
                // Snap these out INSTANTLY so there's nothing visible left to
                // reposition. Every other step keeps the gentle cross-fade.
                var sid = s.id || (s.options && s.options.id) || '';
                var isDropdownItemStep = sid.indexOf('home_tour_iddrop_') === 0 || sid === 'home_tour_t_account';
                if (isDropdownItemStep) {
                  s.el.style.transition = 'none';
                  s.el.style.opacity = '0';
                } else {
                  s.el.style.transition = 'opacity 0.45s ease';
                  s.el.style.opacity = '0';
                }
              } catch (e) { /* fade is best-effort */ }
            });
          }
        });
        // Always tidy the body-level centered-step flag when the tour ends,
        // however it ends.
        tour.tourObject.on('complete', _clearTourCenteredClass);
        tour.tourObject.on('cancel', _clearTourCenteredClass);
        // Make sure the account dropdown never stays force-open after the tour.
        tour.tourObject.on('complete', function() { setIdentityDropdownOpen(false); });
        tour.tourObject.on('cancel', function() { setIdentityDropdownOpen(false); });
        // Re-evaluate card placements live on viewport resize, and remove the
        // listener when the tour ends so it can't leak.
        _this._attachTourResize();
        tour.tourObject.on('complete', function() { _this._detachTourResize(); });
        tour.tourObject.on('cancel', function() { _this._detachTourResize(); });
        // Record completion ONLY when the user finishes the tour (Finish button →
        // shepherd `complete`). NOT bound to `cancel`, so skipping / Esc / the X
        // never marks it done — the flag means "completed at least once".
        tour.tourObject.on('complete', function() { _this._markTourCompleted(); });
        // On finish, return the user to the top of the page (the tour's
        // center-scroll leaves it parked on the last step's card).
        tour.tourObject.on('complete', _scrollTourToTop);
        // Lock page scroll while the tour runs. A modal tour drives the view
        // itself (each step's scrollTo centers its target via scrollIntoView,
        // which still works on an overflow:hidden container), so letting the
        // user scroll the page out from under the spotlight only causes
        // floating-ui to flip/chase the popover — the "bounce" + "freeze" on a
        // tall target (e.g. the board-picker grid). Restore on either end.
        tour.tourObject.on('complete', function() { _this._unlockTourScroll(); });
        tour.tourObject.on('cancel', function() { _this._unlockTourScroll(); });
      }
      if (options.afterComplete && tour.tourObject) {
        // Auto-open handoff (critical-mode setup) — fire however the tour ends.
        tour.tourObject.on('complete', options.afterComplete);
        tour.tourObject.on('cancel', options.afterComplete);
      } else if (firstTimeNav && tour.tourObject) {
        // Manual first-time finish — hand off to the board picker on FINISH only
        // (not on skip/close).
        tour.tourObject.on('complete', firstTimeNav);
      }
      _this._lockTourScroll();
      tour.start();
    });
  },

  // Lock/unlock page scroll for the duration of the tour. We set overflow:hidden
  // on the app's scroll containers (the main `#content` pane plus body/html as a
  // catch-all for layouts that scroll the window), remembering each prior inline
  // value so it's restored exactly. overflow:hidden blocks user wheel/scrollbar
  // scrolling but does NOT block programmatic scroll — Shepherd's per-step
  // scrollIntoView still brings each target into view (verified). Idempotent.
  _lockTourScroll: function() {
    if (this._scrollLocked) { return; }
    var els = [];
    var content = document.getElementById('content');
    if (content) { els.push(content); }
    if (document.body) { els.push(document.body); }
    if (document.documentElement) { els.push(document.documentElement); }
    this._scrollLocked = els.map(function(el) {
      var prev = el.style.overflow;
      el.style.overflow = 'hidden';
      return { el: el, prev: prev };
    });
  },

  _unlockTourScroll: function() {
    if (!this._scrollLocked) { return; }
    this._scrollLocked.forEach(function(o) { o.el.style.overflow = o.prev || ''; });
    this._scrollLocked = null;
  },

  // Attach a window-resize listener that re-evaluates card placements when the
  // viewport changes. Idempotent — a second call is a no-op while one is already
  // attached.
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

  // On resize: recompute placement for each card step from its element's LIVE
  // geometry (left/right/bottom), then re-show the open step if anything
  // changed so Floating UI repositions it. Only `home_tour_card_*` steps are
  // geometry-placed — the nav/intro/outro steps keep their fixed placement. The
  // cheap "nothing changed" early-return keeps this safe to call on every tick.
  _onTourResize: function() {
    var tour = this.get('tour');
    var obj = tour && tour.tourObject;
    if (!obj) { return; }
    var changed = false;
    (obj.steps || []).forEach(function(step) {
      var id = step.id || (step.options && step.options.id);
      var opts = step.options || {};
      if (!opts.attachTo || !id || id.indexOf('home_tour_card_') !== 0) { return; }
      var el = (typeof opts.attachTo.element === 'string') ? document.querySelector(opts.attachTo.element) : opts.attachTo.element;
      if (!el) { return; }
      var side = placementForElement(el);
      if (opts.attachTo.on !== side) { opts.attachTo.on = side; changed = true; }
    });
    if (!changed) { return; }
    var current = obj.getCurrentStep && obj.getCurrentStep();
    if (current && typeof current.show === 'function') {
      if (typeof current.isOpen !== 'function' || current.isOpen()) {
        current.show();
      }
    }
  },

  // Persist "this page's tour has been completed at least once" as a user
  // preference: preferences.progress.guided_tours_completed[<tourKey>] = true
  // (e.g. home_gentle / home_focused). Idempotent — no save if already recorded.
  // Uses FRESH object copies at every level (prefs → progress → map) so
  // ember-data sees a real reference change and serializes it — an in-place
  // nested mutation leaves hasDirtyAttributes false and never saves (same
  // gotcha display-style documents). Mirrors the progress-flag convention used
  // by board-intro / speak-mode-intro (preferences.progress.*).
  _markTourCompleted: function() {
    var key = this.get('tourKey');
    var user = this.get('appState.currentUser');
    if (!key || !user) { return; }
    var prefs = Object.assign({}, user.get('preferences') || {});
    var progress = Object.assign({}, prefs.progress || {});
    var done = Object.assign({}, progress.guided_tours_completed || {});
    if (done[key]) { return; }
    done[key] = true;
    progress.guided_tours_completed = done;
    prefs.progress = progress;
    user.set('preferences', prefs);
    if (user.save) { user.save().then(null, function() { /* best-effort */ }); }
  },

  // Safety net: if the component is torn down while the tour is open (route
  // change, etc.), make sure the resize listener is removed.
  willDestroyElement: function() {
    this._detachTourResize();
    this._unlockTourScroll();
    setIdentityDropdownOpen(false);
    this._super.apply(this, arguments);
  },

  actions: {
    startTour: function() {
      this._startTour();
    }
  }
});
