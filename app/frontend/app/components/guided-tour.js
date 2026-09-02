import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { alias } from '@ember/object/computed';
import { observer, computed } from '@ember/object';
import { scheduleOnce, later as runLater } from '@ember/runloop';
import i18n from '../utils/i18n';
import { tourBuilderFor, tourKeyFor } from '../utils/tours/registry';
import { placementForElement, setIdentityDropdownOpen, scrollIntoViewSettled } from '../utils/tours/shared';
import modal from '../utils/modal';
import article50Gate from '../utils/article50_gate';
import boardDetailCache from '../utils/board_detail_cache';

// Tracks which in-body tour-action buttons already have their click handler, so
// re-shows of the SAME element don't double-bind. A WeakSet (keyed on the element,
// no DOM mutation) instead of an expando property: a freshly-created element is
// simply absent → gets wired; a reused element is present → skipped; and entries
// are GC'd with their elements, so it never leaks across tours.
var _wiredTourActionButtons = new WeakSet();

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
  // Shepherd sets `step.target` to `document.body` for centered (no attachTo)
  // steps. Scrolling <body> is meaningless and keeps the card in
  // `md-tour__step--revealing` (visibility:hidden + pointer-events:none) for
  // the whole scroll animation — Skip / Start / X look dead on welcome/outro.
  // Only scroll when the step is truly attached to a page element.
  var attach = step.options && step.options.attachTo;
  var hasAttach = !!(attach && attach.element);
  var target = step.target;
  if (!hasAttach || !target || target === document.body || target === document.documentElement) {
    reveal();
    return;
  }
  var block = (step.options && step.options.scrollBlock) || 'center';
  var force = !!(step.options && step.options.scrollBlock);
  // `scrollBlock: 'none'` — DO NOT MOVE THE PAGE for this step. For a target that is both
  // tall and already on screen (the caseload roster), any scroll is a loss: centring it
  // drags the view down past the first rows, and even aligning its top nudges the page for
  // no gain. The spotlight and the popover work perfectly well where the user already is.
  // Distinct from omitting scrollBlock, which still centre-scrolls when the target is not
  // judged "in view" — this skips the scroll outright and reveals immediately.
  if (block === 'none') { reveal(); return; }
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
  // Exclude the welcome step's "Skip tour" off-ramp (home_tour_skip_handoff): it's
  // appended to the step list so tour.show() can reach it, but it's NOT part of the
  // linear 1..N walkthrough, so it must not inflate the dot count or shift the
  // active dot. When the skip step itself is showing, idx becomes -1 below → no dots.
  var steps = ((step.tour && step.tour.steps) || []).filter(function(s) {
    return (s.id || (s.options && s.options.id)) !== 'home_tour_skip_handoff';
  });
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
  // Wire any in-BODY action buttons (rendered via shared.js tourBodyButton with a
  // `data-tour-action`) to the Tour. Generic so any step/tour can put a driving
  // button in its body: `show:<id>` jumps, `next` advances (same as the footer
  // Next/Start button), `complete`/`cancel` end the tour. Any other `data-tour-
  // action` (e.g. the welcome step's not-yet-wired `speak` button) simply matches
  // no branch and is a no-op. Wired once per element (Shepherd reuses the step
  // element across re-shows).
  try {
    if (step.el) {
      var actionEls = step.el.querySelectorAll('[data-tour-action]');
      Array.prototype.forEach.call(actionEls, function(btn) {
        if (_wiredTourActionButtons.has(btn)) { return; }
        _wiredTourActionButtons.add(btn);
        btn.addEventListener('click', function(e) {
          e.preventDefault();
          var spec = btn.getAttribute('data-tour-action') || '';
          var tour = step.tour;
          if (!tour) { return; }
          if (spec.indexOf('show:') === 0) { tour.show(spec.slice(5)); }
          else if (spec === 'next') { tour.next(); }
          else if (spec === 'complete') { tour.complete(); }
          else if (spec === 'cancel') { tour.cancel(); }
          else if (spec === 'speak') {
            // Home-tour "I'd like to start speaking" — route to the user's own
            // board copy in speak mode (see _startSpeakingHandoff on the component,
            // reached via the tourObject bridge set in _startTour).
            var comp = tour && tour._llGuidedTour;
            if (comp && typeof comp._startSpeakingHandoff === 'function') { comp._startSpeakingHandoff(); }
          }
        });
      });
    }
  } catch (e) { /* body-action wiring is best-effort */ }
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
  persistence: service('persistence'),

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

  // Whether THIS page+view's tour has already been AUTO-OPENED once for this
  // user. Deliberately separate from `tourSeen` above: that flag records only a
  // FINISHED tour (it drives the trigger's check badge, so binding it to cancel
  // would make the badge lie). Auto-open needs the weaker "we already showed
  // this to them" test — a user who skipped or dismissed the tour should not
  // have it thrown at them again on their next board pick.
  tourAutoShown: computed('appState.currentUser.preferences.progress.guided_tours_autoshown', 'tourKey', function() {
    var key = this.get('tourKey');
    if (!key) { return false; }
    var map = this.get('appState.currentUser.preferences.progress.guided_tours_autoshown') || {};
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
  // Home-dashboard only. Board-detail speak/edit hosts must NOT run this —
  // `_scheduleAutoOpen` binds afterComplete → board-picker on cancel/complete, so
  // a speak-tour Skip/X would yank the user off their board.
  _autoOpenWatcher: observer('appState.auto_open_home_tour', function() {
    if (this.get('speakHost') || this.get('editHost')) { return; }
    if (this.get('appState.auto_open_home_tour')) {
      this._consumeAutoOpenSignal();
    }
  }),

  // True only when THIS instance is the board-detail EDIT tour (edit mode on a
  // board-detail route → tourKey 'board_detail_edit_*'). The auto-start guard must
  // use this, NOT a bare `tourBuilder` truthy check: the pending flag would be
  // flipped while the user is STILL on /board-picker, where the navbar guided-tour
  // instance has a (board-PICKER) tourBuilder — a truthy check would let it consume
  // the flag and fire the WRONG tour. Gating on the board-detail-edit tourKey makes
  // only the edit-chrome instance respond. (See the DORMANT note on
  // _boardDetailTourWatcher below: no writer sets `board_detail_tour_pending` yet,
  // so this guard is correct but currently unexercised.)
  _isBoardDetailEditTour: function() {
    return (this.get('tourKey') || '').indexOf('board_detail_edit') === 0;
  },

  // Auto-fire the board-detail EDIT tour when `appState.board_detail_tour_pending`
  // is set. All three entry points (init, this observer, didInsertElement) funnel
  // into the single poll-based consumer below, which clears the flag once and only
  // on the board-detail edit instance.
  //
  // DORMANT: nothing in app/frontend sets this flag truthy. `git grep
  // board_detail_tour_pending` returns only reads, the two `set(…, false)` clears,
  // and comments. "Pick this Board" (components/board-preview-overlay.js) sets the
  // SPEAK flag, `board_detail_tour_pending_speak`, which is a different path with
  // its own consumer. This machinery is kept, not deleted, because the create-board
  // path is the intended writer and the plumbing is correct as written — but until
  // something sets the flag, the edit tour cannot auto-open, and any change here is
  // unobservable at runtime. Do not read a passing test or a clean diff as evidence
  // that a change to this path works; wire a writer first.
  _boardDetailTourWatcher: observer('appState.board_detail_tour_pending', 'tourKey', function() {
    this._consumePendingBoardDetailTour();
  }),

  // True only when THIS instance is the board-PICKER tour (tourKey
  // 'board_picker_*'). Gates the pending-board-picker consumer so the flag is only
  // honored once the navbar instance has actually landed on /board-picker — never
  // on the home page it was set from (whose tourBuilder is the HOME tour).
  _isBoardPickerTour: function() {
    return (this.get('tourKey') || '').indexOf('board_picker') === 0;
  },

  // Auto-fire the board-PICKER tour when `appState.board_picker_tour_pending` is
  // set — flipped by the home tour's onPickBoard handoff (skip-handoff "Choose
  // Board" + first-time outro finish) right before routing to /board-picker. The
  // navbar guided-tour instance is persistent (no remount across the in-app
  // transition), so this observer on the flag + tourKey is the trigger: it fires
  // when the flag flips AND again when tourKey recomputes to 'board_picker' after
  // the route settles. Mirrors _boardDetailTourWatcher.
  _boardPickerTourWatcher: observer('appState.board_picker_tour_pending', 'tourKey', function() {
    this._consumePendingBoardPickerTour();
  }),

  // True only when THIS instance is the board-detail SPEAK tour (NON-edit board
  // detail → tourKey 'board_detail_speak_*'). Gates the speak consumer so the flag
  // is only honored once the page is recognizably board-detail speak mode — never
  // on the board-picker page it was set from.
  _isBoardDetailSpeakTour: function() {
    return (this.get('tourKey') || '').indexOf('board_detail_speak') === 0;
  },

  // Auto-fire the board-detail SPEAK tour when `appState.board_detail_tour_pending_speak`
  // is set — flipped by board-preview "Pick this Board" right before routing into
  // board-detail SPEAK mode. Mirrors _boardDetailTourWatcher (edit), but keyed on
  // the speak flag + the speak tourKey. Only the board-detail speak host
  // (`speakHost`) may consume — the navbar runner briefly shares the speak
  // tourKey during the board-picker → board-detail transition while
  // empty_header is still true, and must not steal the start (or get destroyed
  // mid-tour when currentBoardState lands).
  _boardDetailSpeakTourWatcher: observer('appState.board_detail_tour_pending_speak', 'tourKey', function() {
    this._consumePendingBoardDetailSpeakTour();
  }),

  // Consume the pending-board-picker flag and auto-open the board-picker tour once
  // this instance is the board-picker tour (route + tourKey settled). The flag is
  // set on the home page, so the first observer pass (still 'user.home') polls on a
  // bounded schedule until tourKey becomes 'board_picker' after the transition,
  // then clears the flag ONCE and starts. The `_bpTourConsuming` guard stops the
  // init + observer triggers from stacking parallel polls. Simpler than the
  // board-detail consumer — there's a single board-picker page, so no board-key
  // match is needed.
  _consumePendingBoardPickerTour: function() {
    var _this = this;
    if (this.isDestroyed || this.isDestroying) { return; }
    if (!this.get('appState.board_picker_tour_pending')) { return; }
    if (this._bpTourConsuming) { return; }
    this._bpTourConsuming = true;
    var attempts = 0;
    var tryConsume = function() {
      if (_this.isDestroyed || _this.isDestroying) { _this._bpTourConsuming = false; return; }
      // Another instance/hook may have consumed it first.
      if (!_this.get('appState.board_picker_tour_pending')) { _this._bpTourConsuming = false; return; }
      if (_this._isBoardPickerTour()) {
        _this._bpTourConsuming = false;
        _this.appState.set('board_picker_tour_pending', false);
        _this._startTour();
      } else if (attempts++ < 20) {              // ~3s ceiling (20 × 150ms)
        runLater(_this, tryConsume, 150);
      } else {
        // Never became the board-picker tour (e.g. the transition failed) — stop
        // polling but LEAVE the flag so a later board-picker mount can pick it up.
        _this._bpTourConsuming = false;
      }
    };
    scheduleOnce('afterRender', this, tryConsume);
  },

  // Consume the pending-edit-tour flag and auto-open the board-detail EDIT tour.
  // Gated on `editHost` (the edit-panel GuidedTour) so the navbar runner cannot
  // start it during the brief empty_header race into board-detail edit.
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
    // Only the edit-panel host may auto-start the edit tour (see editHost).
    if (!this.get('editHost')) { return; }
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

  // Consume the pending-SPEAK-tour flag and auto-open the board-detail SPEAK tour.
  // Mirror of _consumePendingBoardDetailTour (edit): polls until this instance is
  // the speak tour AND the page is the copied board (key match against
  // currentBoardState.key), so a stale flag never fires the tour on the wrong board.
  // Gated on `speakHost` so the navbar runner cannot start (then abandon) it.
  _consumePendingBoardDetailSpeakTour: function() {
    var _this = this;
    if (this.isDestroyed || this.isDestroying) { return; }
    if (!this.get('speakHost')) { return; }
    if (!this.get('appState.board_detail_tour_pending_speak')) { return; }
    if (this._bdSpeakTourConsuming) { return; }
    this._bdSpeakTourConsuming = true;
    var attempts = 0;
    var tryConsume = function() {
      if (_this.isDestroyed || _this.isDestroying) { _this._bdSpeakTourConsuming = false; return; }
      var pending = _this.get('appState.board_detail_tour_pending_speak');
      if (!pending) { _this._bdSpeakTourConsuming = false; return; }
      if (_this._isBoardDetailSpeakTour()) {
        // `pending` carries the picked board's KEY — fire ONLY when the speak page
        // this instance mounted on IS that board.
        if (typeof pending === 'string') {
          var curKey = _this.get('appState.currentBoardState.key');
          if (!curKey) {
            if (attempts++ < 20) { runLater(_this, tryConsume, 150); }
            else { _this._bdSpeakTourConsuming = false; }   // give up; leave flag for a later mount
            return;
          }
          if (curKey !== pending) {
            // On a board-detail speak page, but NOT the picked board — consume the
            // stale flag WITHOUT firing so it can't auto-open on the wrong board.
            _this._bdSpeakTourConsuming = false;
            _this.appState.set('board_detail_tour_pending_speak', false);
            _this.appState.set('board_detail_tour_speak_manual', false);
            return;
          }
        }
        // Manual replay ("Take a tour") routes through the SAME pending flag as
        // the post-pick auto-open, so the once-per-user gate downstream has to be
        // told which one this is — otherwise it swallows the manual trigger too.
        // Read and clear together with the pending flag.
        var manual = !!_this.get('appState.board_detail_tour_speak_manual');
        _this._bdSpeakTourConsuming = false;
        _this.appState.set('board_detail_tour_pending_speak', false);
        _this.appState.set('board_detail_tour_speak_manual', false);
        _this._scheduleBoardDetailSpeakAutoOpen(manual);
      } else if (attempts++ < 20) {              // ~3s ceiling (20 × 150ms)
        runLater(_this, tryConsume, 150);
      } else {
        // Not a board-detail speak page after all — stop polling but LEAVE the flag
        // set so a genuine speak instance can still pick it up later.
        _this._bdSpeakTourConsuming = false;
      }
    };
    scheduleOnce('afterRender', this, tryConsume);
  },

  // ---- Auto-open vs the EU AI Act Art. 50(1) session-entry notice ----------
  //
  // The terms-agree confirm does two things from one click: routes/index.js opens
  // the (uncloseable) ai-disclosure modal once the terms promise resolves, and
  // terms-agree.js:66 raises auto_open_home_tour. Observed in production on
  // 2026-09-02: the Shepherd tour painted over the notice (z 9999 over 1050) and
  // took focus; cancelling the tour ran the board-picker handoff below, and the
  // route change closed the notice through app-state.js#global_transition's
  // unconditional modal.close() with nothing acknowledged. So the auto-open waits
  // here, in the one consumer, until the notice is neither open nor due.
  //
  // "Due" = article50Gate.sessionEntryGatePending on the gate subject: the notice
  // opens on a promise microtask AFTER the flag flips (the flip is synchronous
  // inside confirm, afterRender flushes before the microtask), so at the first
  // check the modal is not open yet. That predicate needs really_fresh, a 30s
  // window, so it cannot hold the tour indefinitely on its own; the due-wait is
  // additionally capped by art50_tour_due_max_ms in case the notice never opens
  // (a bumped modal, a stale model). The OPEN-wait is deliberately uncapped: the
  // notice closes only on acknowledgement or on navigation, both of which end
  // the wait, and a time cap would re-create the defect for a slow reader.
  //
  // When the wait ends on this instance, _runAutoOpen runs, so the board-picker
  // handoff (home-board pick) is kept, matching the no-tour case below. If the
  // instance is torn down mid-wait instead (the navbar host is rendered only
  // under useAppNavbarInHeader, templates/application.hbs:8, so a route change
  // during the hold destroys it), willDestroy re-arms the signal with a stamp
  // and _consumeAutoOpenSignal drops it if no navbar instance picks it up
  // within art50_tour_rearm_max_ms: an old signal must not resurrect the tour
  // and its handoff at an arbitrary later moment.
  // Tunables are properties so tests can shrink them (focus-words.js precedent).
  // Called off the DEFAULT export of article50_gate on purpose so tests can stub.
  art50_tour_defer_poll_ms: 250,
  art50_tour_due_max_ms: 5000,
  art50_tour_rearm_max_ms: 60000,
  _autoOpenDeferring: false,

  // The one place appState.auto_open_home_tour is cleared (init and
  // _autoOpenWatcher both come here). A signal re-armed by willDestroy carries
  // auto_open_home_tour_rearmed_at; a fresh signal from any of its writers does
  // not, and is always honoured.
  _consumeAutoOpenSignal: function() {
    var appState = this.get('appState');
    appState.set('auto_open_home_tour', false);
    var rearmedAt = appState.get('auto_open_home_tour_rearmed_at');
    appState.set('auto_open_home_tour_rearmed_at', null);
    if (rearmedAt && (Date.now() - rearmedAt) > this.get('art50_tour_rearm_max_ms')) { return; }
    this._scheduleAutoOpen();
  },

  _scheduleAutoOpen: function() {
    // Belt-and-suspenders: never attach the board-picker handoff from a
    // board-detail host (see _autoOpenWatcher).
    if (this.get('speakHost') || this.get('editHost')) { return; }
    // init and _autoOpenWatcher can both call this; run one chain at a time.
    if (this._autoOpenDeferring) { return; }
    this._autoOpenDeferring = true;
    this._autoOpenAfterArt50Notice(Date.now());
  },

  _art50NoticeHoldsAutoOpen: function(startedAt) {
    if (modal.is_open('ai-disclosure')) { return true; }
    var subject = article50Gate.art50Subject(this.get('appState'));
    if (!article50Gate.sessionEntryGatePending(subject)) { return false; }
    return (Date.now() - startedAt) < this.get('art50_tour_due_max_ms');
  },

  _autoOpenAfterArt50Notice: function(startedAt) {
    if (this.isDestroyed || this.isDestroying) { return; }
    if (this._art50NoticeHoldsAutoOpen(startedAt)) {
      runLater(this, this._autoOpenAfterArt50Notice, startedAt, this.get('art50_tour_defer_poll_ms'));
      return;
    }
    this._runAutoOpen();
  },

  _runAutoOpen: function() {
    this._autoOpenDeferring = false;
    // SUPPORTERS (SLPs/therapists/teachers/parents — all collapse to
    // `supporter_role`) tour their CASELOAD, not the dashboard. That page is where
    // routes/index.js `_land_on_default` already sends them on every subsequent
    // login; the only reason they are sitting on the dashboard right now is that
    // the terms-agree session gate had to run there first (see
    // `_session_entry_gate_pending` in that route). They also get NO board-picker
    // handoff — that exists so a newly-registered COMMUNICATOR still completes the
    // must-have home-board pick, and a supporter has no board of their own to pick.
    if (this.get('appState.currentUser.supporter_role')) {
      this._startCaseloadAutoOpen();
      return;
    }
    scheduleOnce('afterRender', this, this._startHomeAutoOpen);
  },

  _startHomeAutoOpen: function() {
    var _this = this;
    // After the home tour ends (any way it ends), hand the user off to the
    // standalone board-picker so the remaining must-have step (home board pick)
    // still happens. board-picker is the dedicated communicator board-setup
    // page — intentionally decoupled from the legacy setup wizard, and the same
    // target the tour's "choose my board" skip path uses (see below).
    var handoff = function() {
      _this.router.transitionTo('board-picker');
    };
    // If the current page/layout has no tour (e.g. a newly-registered user on
    // the default Focused View, whose tour isn't built yet), skip the tour but
    // STILL run the handoff so the home-board pick is never lost.
    if (!this.get('tourBuilder')) { handoff(); return; }
    this._startTour({ afterComplete: handoff });
  },

  // Route a supporter to their caseload and start the CASELOAD tour there.
  // The route hop means this instance's `tourBuilder`/`tourKey` recompute from
  // `appState.current_route`, which settles a microtask or two AFTER the
  // transition promise resolves — so poll for the caseload tour to become current
  // rather than firing at a single afterRender (LEARNINGS.md: "a guided-tour
  // auto-open flag consumed at a single afterRender misses when the gating state
  // resolves on a promise microtask — poll the condition"). Same bound as the
  // board-detail consumers: ~3s (20 x 150ms). If it never becomes current we
  // simply don't fire — the user is left on their caseload with the "Take a tour"
  // trigger right there, which is a safe outcome rather than a wrong tour.
  // The navbar GuidedTour instance is persistent across in-app transitions, so
  // `this` survives the hop; the isDestroyed guard covers a logout mid-poll.
  _startCaseloadAutoOpen: function() {
    var _this = this;
    var attempts = 0;
    var tryStart = function() {
      if (_this.isDestroyed || _this.isDestroying) { return; }
      if ((_this.get('tourKey') || '').indexOf('caseload') === 0) {
        _this._startTour();
        return;
      }
      if (attempts++ < 20) { runLater(_this, tryStart, 150); }
    };
    var go = function() { scheduleOnce('afterRender', _this, tryStart); };
    if (this.get('appState.current_route') === 'caseload') { go(); return; }
    // Route errors resolve to the same poll: if the transition is superseded the
    // poll just times out harmlessly rather than leaving a dangling promise.
    var t = this.router.transitionTo('caseload');
    if (t && t.then) { t.then(go, go); } else { go(); }
  },

  // Set true when the home-tour "I'd like to start speaking" button takes over the
  // tour end, so the guarded board-picker hand-offs (afterComplete/firstTimeNav in
  // _startTour) skip and we route to the board instead.
  _speakHandoffActive: false,

  // Home-tour "I'd like to start speaking / Pick a board (page-set) for me" hand-off.
  // Routes the user to THEIR OWN copy of Vocal Flair 84 — copied into their library
  // at registration, at the predictable key `<user_name>/vocal-flair-84` — opened on
  // board-detail in SPEAK mode, with the speak tour auto-opening there.
  //
  // Option B — CHECK + WAIT, never initiate: the copy is scheduled asynchronously at
  // registration, so it may not exist yet. We poll the board's /tree by key (a plain
  // read — no copy is triggered here) until it resolves, then route. All runtime (no
  // build-time state), so it behaves identically on deployment.
  //
  // The poll uses the SAME /tree endpoint the board-detail route uses, and ingests
  // the response (root + descendants) into boardDetailCache + the Ember Data store.
  // So the poll IS the board load: when we then route, the model hook is a pure cache
  // HIT — no redundant second network fetch — and every folder tap is already warm.
  // /tree doubles as the existence check: until the copy materializes it 404s (→
  // ingest_tree returns false / the request rejects) and we keep polling.
  _startSpeakingHandoff: function() {
    var _this = this;
    var appState = _this.get('appState');
    var user = appState.get('currentUser');
    var userName = user && user.get('user_name');
    if (!userName) { return; }
    var boardname = 'vocal-flair-84';
    var key = userName + '/' + boardname;
    var warm_opts = {
      skin: user.get('preferences.skin'),
      preferred_symbols: user.get('preferences.preferred_symbols')
    };
    // Take over the tour end (suppress the default board-picker hand-off), then
    // close the tour.
    _this.set('_speakHandoffActive', true);
    try {
      var to = _this.get('tour.tourObject');
      if (to && typeof to.cancel === 'function') { to.cancel(); }
    } catch (e) { /* best-effort */ }
    appState.show_loading_overlay(i18n.t('loading_your_board', "Loading your board..."));
    var attempts = 0;
    var MAX_ATTEMPTS = 15; // ~15s at 1s intervals, then fall back to the board-picker
    var go = function() {
      if (_this.isDestroyed || _this.isDestroying) { return; }
      // Flag the board-detail SPEAK tour to auto-open once we land on THIS board
      // (runtime hand-off flag; the board-detail route hides the overlay on load).
      // Clear the manual-replay companion explicitly: a "Take a tour" request that
      // was never consumed (user navigated away first) would otherwise still be
      // set here and make this AUTO open skip its once-per-user bookkeeping,
      // re-creating the every-pick re-fire this flag pair exists to prevent.
      appState.set('board_detail_tour_speak_manual', false);
      appState.set('board_detail_tour_pending_speak', key);
      var t = _this.get('router').transitionTo('user.board-detail', userName, boardname);
      if (t && typeof t.catch === 'function') {
        t.catch(function() {
          // Transition failed: clear the pending flag so the speak tour doesn't
          // auto-open on an unrelated future board-detail visit.
          appState.set('board_detail_tour_pending_speak', false);
          appState.hide_loading_overlay();
        });
      }
    };
    var retry = function() {
      attempts++;
      if (attempts >= MAX_ATTEMPTS) {
        // The owned VF84 copy never materialized within the window — most likely
        // the backend copy gate (signup_default_library_boards) is off on this
        // deployment, or the copy is unusually slow. Don't dead-end the user on an
        // error modal: fall back to the standalone board-picker (the same "pick a
        // board" destination the rest of the tour uses), where the copy will show
        // up once it lands. The board-picker route hides the overlay on load.
        var t = _this.get('router').transitionTo('board-picker');
        if (t && typeof t.catch === 'function') {
          t.catch(function() { appState.hide_loading_overlay(); });
        }
        return;
      }
      runLater(_this, check, 1000);
    };
    var check = function() {
      if (_this.isDestroyed || _this.isDestroying) { return; }
      // CHECK + PRIME — a plain GET of the owned copy's /tree by key. Does NOT
      // initiate a copy. On success, prime the board-detail cache so the route
      // is a cache hit; if the copy hasn't materialized, ingest_tree returns
      // false (no usable root) and we keep polling.
      // Encode the user-supplied user_name segment (boardname is a safe literal);
      // the '/' separator stays literal since the board key is `username/boardname`.
      _this.get('persistence').ajax('/api/v1/boards/' + encodeURIComponent(userName) + '/' + boardname + '/tree', { type: 'GET' }).then(function(data) {
        // The poll can settle after the component is torn down (tour closed /
        // route left) — bail so go()/retry() don't run on a destroyed component.
        if (_this.isDestroyed || _this.isDestroying) { return; }
        if (boardDetailCache.ingest_tree(data, warm_opts, { force: true })) {
          go();
        } else {
          retry();
        }
      }, function() {
        if (_this.isDestroyed || _this.isDestroying) { return; }
        retry();
      });
    };
    check();
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
        // Show the walkthrough ONCE per user, same rule as the SPEAK auto-open.
        // `tourKey` only resolves to the edit key once we're on the board-detail
        // page in edit mode, so this is checked here (at fire time) rather than
        // when the pending flag is consumed. Manual entry via the "Take a tour"
        // trigger is unaffected — this gate is only on the AUTO path.
        if (_this.get('tourAutoShown')) { return; }
        _this._markTourAutoShown();
        _this._startTour();
      } else {
        runLater(_this, tryStart, 150);
      }
    };
    scheduleOnce('afterRender', this, tryStart);
  },

  // Board-detail SPEAK tour opener. Same shape as the edit auto-open: wait for
  // the board grid to render (so the interior spotlights resolve instead of being
  // skipped), re-confirm we're still the speak tour, then start. Bounded.
  //
  // `manual` distinguishes the two callers, which share one pending flag: the
  // post-"Pick this Board" auto-open (false) and the options-menu "Take a tour"
  // item (true, via board-detail.js#start_speak_tour). Only the auto path is
  // once-per-user. Getting this wrong is not a small bug: the component's own
  // Shepherd trigger button is `display: none` (app.scss ~71474), so that menu
  // item is the ONLY way to replay this tour, and every user who has picked a
  // home board has already tripped the gate.
  _scheduleBoardDetailSpeakAutoOpen: function(manual) {
    var _this = this;
    var attempts = 0;
    var tryStart = function() {
      if (_this.isDestroyed || _this.isDestroying) { return; }
      attempts++;
      var ready = document.querySelector('.md-board-detail-grid .md-board-detail-symbol-card') ||
                  document.querySelector('.md-board-detail-grid');
      if (ready || attempts >= 20) {        // ~3s ceiling (20 × 150ms)
        if (!_this._isBoardDetailSpeakTour()) { return; }
        // AUTO-show the walkthrough once per user. `tourKey` only resolves to the
        // speak key now that we're on the board-detail speak page, so this is
        // checked here (at fire time) rather than when the pending flag is
        // consumed. A manual replay skips both the gate and the bookkeeping —
        // asking for the tour is not an auto-show and must not consume the
        // one-shot, or a second manual replay would be swallowed.
        if (!manual) {
          if (_this.get('tourAutoShown')) { return; }
          _this._markTourAutoShown();
        }
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

    // Reset the speak-handoff takeover flag at the start of EVERY tour run. The
    // navbar guided-tour instance is persistent (no remount across in-app
    // transitions), so without this a prior "start speaking" handoff (which sets
    // _speakHandoffActive true and never otherwise clears it) would keep the
    // board-picker complete/first-time handoffs permanently suppressed on every
    // later tour run in the same page session.
    _this.set('_speakHandoffActive', false);

    // ember-shepherd's addSteps → _initialize creates a NEW Shepherd.Tour without
    // cancelling the previous one. If a tour is still active, cancel it first
    // (suppressing afterComplete) so we don't stack orphan popovers / cancelIcons.
    if (tour.get('isActive')) {
      _this.set('_suppressHandoff', true);
      try { tour.cancel(); } catch (e) { /* best-effort */ }
      _this.set('_suppressHandoff', false);
    }

    // Defaults applied to every step. Per ember-shepherd docs these MUST be set
    // before addSteps() so Shepherd picks them up when instantiating each step.
    tour.set('confirmCancel', false);
    tour.set('modal', true);
    // MUST be set explicitly even though Shepherd defaults both to true.
    // ember-shepherd's tour service declares `exitOnEsc` / `keyboardNavigation`
    // as tracked properties initialised to undefined and then passes them
    // POSITIVELY into `new Shepherd.Tour({ exitOnEsc, keyboardNavigation, ... })`
    // (services/tour.js#_initialize). Shepherd merges with
    // `Object.assign({}, {exitOnEsc: true, keyboardNavigation: true}, options)`,
    // and an explicit `undefined` OVERWRITES the default — so leaving these
    // unset silently disabled both. Verified live: tourObject.options.exitOnEsc
    // read back as undefined, Escape did not dismiss, and arrow keys did not
    // navigate. That made a full-screen modal overlay (modal:true +
    // canClickTarget:false below) impossible to escape by keyboard — a hard trap
    // for switch-scanning and eye-gaze users, who cannot click the X.
    // Safe on cancel: _unlockTourScroll, _detachTourResize, _clearTourCenteredClass
    // and the afterComplete handoff are all bound to `cancel` as well as
    // `complete`, so an Esc exit cleans up exactly like the X button.
    tour.set('exitOnEsc', true);
    tour.set('keyboardNavigation', true);
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
    // Hand the user off to the board picker AND auto-open the board-picker tour
    // there — flip the pending flag BEFORE the transition so the (persistent
    // navbar) guided-tour instance's _boardPickerTourWatcher consumes it once the
    // route + board_picker tourKey settle. Same mechanism as
    // board_detail_tour_pending. Without the flag this would only navigate, leaving
    // the board-picker page tour-less.
    var onPickBoard = function() {
      _this.appState.set('board_picker_tour_pending', true);
      _this.router.transitionTo('board-picker');
    };
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
        // Bridge: expose this component to the module-level _onTourStepShow
        // dispatch (which only sees the Shepherd step/tour, not the component) so a
        // tour body button can drive component-level actions — the 'speak' hand-off.
        tour.tourObject._llGuidedTour = _this;
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
        // Auto-open handoff (critical-mode setup) — fire however the tour ends,
        // UNLESS the "start speaking" body button took over (it routes to the
        // user's board in speak mode instead of the board picker; _startSpeakingHandoff
        // sets _speakHandoffActive before cancelling the tour).
        // Also refuse once the user is already on board-detail: a stale home-tour
        // cancel/complete must never yank them back to /board-picker after
        // "Pick this Board" (Skip/X on the speak tour).
        var afterCompleteGuarded = function() {
          if (_this.get('_speakHandoffActive') || _this.get('_suppressHandoff')) { return; }
          var route = _this.get('appState.current_route') || '';
          if (route.indexOf('user.board-detail') === 0) { return; }
          options.afterComplete();
        };
        tour.tourObject.on('complete', afterCompleteGuarded);
        tour.tourObject.on('cancel', afterCompleteGuarded);
      } else if (firstTimeNav && tour.tourObject) {
        // Manual first-time finish — hand off to the board picker on FINISH only
        // (not on skip/close), and not when "start speaking" took over.
        var firstTimeNavGuarded = function() {
          if (_this.get('_speakHandoffActive') || _this.get('_suppressHandoff')) { return; }
          var route = _this.get('appState.current_route') || '';
          if (route.indexOf('user.board-detail') === 0) { return; }
          firstTimeNav();
        };
        tour.tourObject.on('complete', firstTimeNavGuarded);
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
      // attachTo.element may be a live-resolver FUNCTION (utils/tours/shared
      // liveTarget), a selector string, or a raw element — resolve all three to a
      // real node before measuring, so this never calls getBoundingClientRect on
      // a function.
      var raw = opts.attachTo.element;
      var el = (typeof raw === 'function') ? raw() : (typeof raw === 'string') ? document.querySelector(raw) : raw;
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

  // Persist "this page's tour has been AUTO-OPENED once" as
  // preferences.progress.guided_tours_autoshown[<tourKey>] = true. Recorded when
  // the tour auto-fires, NOT when it ends, so it sticks however the user leaves
  // it (finish, skip, X, Esc). Without this the board-detail SPEAK tour re-fired
  // on EVERY home-board pick forever: _scheduleBoardDetailSpeakAutoOpen called
  // _startTour unconditionally, and guided_tours_completed is only written on
  // `complete`, so anyone who dismissed it was never recorded at all.
  // Same fresh-object-copy discipline as _markTourCompleted: ember-data only
  // serializes a real reference change, so mutating the nested map in place
  // would leave hasDirtyAttributes false and never save.
  _markTourAutoShown: function() {
    var key = this.get('tourKey');
    var user = this.get('appState.currentUser');
    if (!key || !user) { return; }
    var prefs = Object.assign({}, user.get('preferences') || {});
    var progress = Object.assign({}, prefs.progress || {});
    var shown = Object.assign({}, progress.guided_tours_autoshown || {});
    if (shown[key]) { return; }
    shown[key] = true;
    progress.guided_tours_autoshown = shown;
    prefs.progress = progress;
    user.set('preferences', prefs);
    if (user.save) { user.save().then(null, function() { /* best-effort */ }); }
  },

  // Safety net: if the component is torn down while the tour is open (route
  // change, etc.), make sure the resize listener is removed. Do NOT cancel the
  // active Shepherd tour here — the navbar instance is destroyed when
  // empty_header flips during board-detail entry, and cancelling would dismiss
  // a tour the board-detail host still needs (or fire a stale afterComplete).
  // Torn down while _autoOpenAfterArt50Notice is still holding the tour: hand the
  // signal back to appState (stamped) so the next navbar instance's init consumes
  // it through _consumeAutoOpenSignal. The pending runLater may still fire once;
  // it exits on the destroyed guard without touching anything. The service can be
  // going down in the same teardown (owner destroy), hence the guard on it.
  willDestroy: function() {
    if (this._autoOpenDeferring) {
      this._autoOpenDeferring = false;
      var appState = this.get('appState');
      if (appState && !appState.isDestroyed && !appState.isDestroying) {
        appState.set('auto_open_home_tour_rearmed_at', Date.now());
        appState.set('auto_open_home_tour', true);
      }
    }
    this._super.apply(this, arguments);
  },

  willDestroyElement: function() {
    this._detachTourResize();
    this._unlockTourScroll();
    setIdentityDropdownOpen(false);
    this._super.apply(this, arguments);
  },

  // Single init (tagless: didInsertElement does NOT fire). The Ember 5.12 upgrade
  // briefly introduced a second init() that only wired onStartTour and overwrote
  // the pending-tour consumers — speak/edit auto-open then relied on the navbar
  // race. Keep onStartTour + pending consumers + home auto-open signals here.
  init() {
    this._super(...arguments);
    this.onStartTour = () => {
      this.send('startTour');
    };

    // Pending board-detail / board-picker / speak flags are often already true
    // when this instance mounts (set before the route transition). Observers only
    // fire on CHANGE, so init is the reliable entry for tagless hosts.
    this._consumePendingBoardDetailTour();
    this._consumePendingBoardPickerTour();
    this._consumePendingBoardDetailSpeakTour();

    // Home auto-open signals — navbar/home only (never speak/edit hosts; those
    // would bind afterComplete → board-picker onto the wrong tour).
    if (!this.get('speakHost') && !this.get('editHost')) {
      if (this.get('appState.auto_open_home_tour')) {
        this._consumeAutoOpenSignal();
      } else {
        try {
          if (window.sessionStorage && sessionStorage.getItem('ll_auto_open_home_tour') === '1') {
            sessionStorage.removeItem('ll_auto_open_home_tour');
            this._scheduleAutoOpen();
          }
        } catch (e) { /* sessionStorage unavailable — fall through */ }
      }
    }
  },

  actions: {
    startTour: function() {
      this._startTour();
    }
  }
});
