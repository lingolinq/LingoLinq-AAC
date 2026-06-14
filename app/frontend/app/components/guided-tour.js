import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { alias } from '@ember/object/computed';
import { observer, computed } from '@ember/object';
import { scheduleOnce } from '@ember/runloop';
import i18n from '../utils/i18n';
import { tourBuilderFor, tourKeyFor } from '../utils/tours/registry';
import { placementForElement, setIdentityDropdownOpen } from '../utils/tours/shared';

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
  // Account menu: keep it OPEN only for the dropdown ITEM steps (they also force
  // it open via beforeShowPromise before positioning). Close it on every other
  // step — including the identity TRIGGER step, which just spotlights the avatar
  // with the menu still closed.
  try {
    var sid = step.id || (step.options && step.options.id) || '';
    var inDropdownItems = sid.indexOf('home_tour_iddrop_') === 0;
    if (!inDropdownItems) { setIdentityDropdownOpen(false); }
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
  // dashboard/authenticated-view's effectiveLayout (default 'focused'; any
  // unset/legacy value resolves to it). Used to pick the per-layout tour.
  effectiveLayout: computed('appState.currentUser.preferences.dashboard_layout', function() {
    var layout = this.get('appState.currentUser.preferences.dashboard_layout') || 'focused';
    if (['gentle', 'focused'].indexOf(layout) === -1) { layout = 'focused'; }
    return layout;
  }),

  // The step-builder for the current page/layout, or null when no tour exists
  // here. Drives both the trigger visibility (hasTour) and _startTour.
  tourBuilder: computed('appState.current_route', 'effectiveLayout', function() {
    return tourBuilderFor(this.get('appState.current_route'), this.get('effectiveLayout'));
  }),

  // Only show the trigger when the current page actually has a tour.
  hasTour: computed('tourBuilder', function() {
    return !!this.get('tourBuilder');
  }),

  // Stable completion-flag key for the current page + layout (e.g. 'home_gentle',
  // 'home_focused'), or null. Persisted under
  // preferences.progress.guided_tours_completed once the tour is COMPLETED.
  tourKey: computed('appState.current_route', 'effectiveLayout', function() {
    return tourKeyFor(this.get('appState.current_route'), this.get('effectiveLayout'));
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

    tour.addSteps(builder()).then(function() {
      // If the component (or tour) was torn down while addSteps was resolving,
      // don't wire handlers / start against a dead instance.
      if (_this.isDestroyed || _this.isDestroying) { return; }
      // After addSteps resolves, `tour.tourObject` is the actual shepherd Tour
      // instance. The ember-shepherd service's own Evented forwards
      // method-triggered events (back, next) but NOT shepherd-native lifecycle
      // events (complete, cancel) — wire those on the underlying Tour directly.
      if (tour.tourObject) {
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
      }
      if (options.afterComplete && tour.tourObject) {
        tour.tourObject.on('complete', options.afterComplete);
        tour.tourObject.on('cancel', options.afterComplete);
      }
      tour.start();
    });
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
    setIdentityDropdownOpen(false);
    this._super.apply(this, arguments);
  },

  actions: {
    startTour: function() {
      this._startTour();
    }
  }
});
