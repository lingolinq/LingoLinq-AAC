import Component from '@ember/component';
import { inject as service } from '@ember/service';
import i18n from '../utils/i18n';
import { availableHomeSections, sectionHidden, sectionLabel, sectionsMapFor, HOME_SECTIONS, gridLayoutState } from '../utils/dashboard_sections';

// Centered-step show hook — toggles the body flag the CSS uses to scope the
// "paused" backdrop blur to centered (non-anchored) modal steps, mirroring
// the home-tour intro/outro behavior so this modal reads the same way. `this`
// is the active Shepherd Step (Shepherd binds the step as the `when.show`
// context).
// Inject the decorative progress-dot row into a step's footer (aria-hidden —
// the footer Back/Next are the real navigation). Count + current index derive
// live from the tour's step list, so the indicator stays correct as the flow
// grows. Mirrors the home-tour helper.
function _renderProgress(step) {
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

function _onShow() {
  var step = this;
  try {
    var attach = step.options && step.options.attachTo;
    var centered = !(attach && attach.element);
    document.body.classList.toggle('md-tour--centered-step', !!centered);
  } catch (e) { /* decorative — never block the step */ }
  try { _renderProgress(step); } catch (e) { /* progress is decorative */ }
}
function _clearCentered() {
  try { document.body.classList.remove('md-tour--centered-step'); } catch (e) { /* noop */ }
  // The Getting Started series cleared the page chrome via `md-gst-active` —
  // restore it when the series ends (Finish / Skip / Esc / close).
  try { document.body.classList.remove('md-gst-active'); } catch (e) { /* noop */ }
}

// Show hook for the "choose your display style" step: runs the shared
// centered-step setup, then GATES the Next button on a selection — Next starts
// disabled and only enables once the user picks a layout option (single-select).
function _onDisplayShow() {
  var step = this;
  try { _onShow.call(step); } catch (e) { /* shared setup is decorative */ }
  var el = step.el;
  if (!el) { return; }

  // Inject a LIVE, full-fidelity copy of the user's real home dashboard,
  // scaled to fit the preview area. Because it's a clone of the real
  // `.md-grid--dashboard`, its responsive layout is identical — so it shows
  // exactly what the home page looks like at the user's current screen width.
  try {
    var live = el.querySelector('.md-gst-preview__live');
    var src = document.querySelector('.md-grid--dashboard');
    if (live && src && !live.querySelector('.md-gst-preview__page')) {
      var page = document.createElement('div');
      page.className = 'md-gst-preview__page';
      page.setAttribute('aria-hidden', 'true');
      var clone = src.cloneNode(true);
      clone.removeAttribute('id');
      Array.prototype.forEach.call(clone.querySelectorAll('[id]'), function(n) { n.removeAttribute('id'); });
      Array.prototype.forEach.call(clone.querySelectorAll('a, button, input, [tabindex]'), function(n) { n.setAttribute('tabindex', '-1'); });
      clone.classList.add('md-gst-preview__clone');
      page.appendChild(clone);
      live.appendChild(page);
    }
  } catch (e) { /* preview is decorative — never block the step */ }

  // Wire the section checkboxes + layout options. On any change we recompute the
  // whole preview (the layout depends on the COMBINATION of toggles) via the
  // shared gridLayoutState — the SAME source of truth as the dashboard render —
  // and refresh the gate: Next is enabled only when a layout AND at least one
  // display element are chosen; with zero elements we also show the empty-state
  // overlay over the preview.
  try {
    var liveEl = el.querySelector('.md-gst-preview__live');
    var gridEl = liveEl && liveEl.querySelector('.md-gst-preview__clone');
    var boxes = el.querySelectorAll('.md-gst-section__input');
    var options = el.querySelectorAll('.md-gst-option');
    var nextBtn = el.querySelector('.shepherd-footer .md-tour__btn--primary');
    var overlay = el.querySelector('.md-gst-empty');
    var STYLE_CLASSES = ['md-grid--with-caseload', 'md-grid--with-org-mgmt'];

    var anyChecked = function() {
      var any = false;
      Array.prototype.forEach.call(boxes, function(b) { if (b.checked) { any = true; } });
      return any;
    };
    // Next requires a layout choice AND at least one display element; the empty
    // overlay appears whenever zero elements are selected.
    var refreshGate = function() {
      var hasSection = anyChecked();
      var hasLayout = !!el.querySelector('.md-gst-option.is-selected');
      var disabled = !(hasSection && hasLayout);
      if (nextBtn) {
        nextBtn.disabled = disabled;
        nextBtn.classList.toggle('md-tour__btn--disabled', disabled);
        nextBtn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
      }
      if (overlay) { overlay.classList.toggle('is-visible', !hasSection); }
    };
    var setCardDisplay = function(cls, visible) {
      Array.prototype.forEach.call(liveEl.querySelectorAll('.' + cls), function(card) {
        // Inline !important: the speak/caseload wide/narrow variants are
        // shown/hidden via `display: ... !important` @media rules, so a plain
        // inline `display:none` can't override them. removeProperty on show
        // hands control back to those media rules (correct variant per width).
        if (visible) { card.style.removeProperty('display'); }
        else { card.style.setProperty('display', 'none', 'important'); }
      });
    };
    var syncState = function() {
      if (liveEl && gridEl) {
        var vis = {};
        Array.prototype.forEach.call(boxes, function(box) {
          vis[box.getAttribute('data-gst-section')] = box.checked;
        });
        HOME_SECTIONS.forEach(function(s) {
          if (vis[s.key] === undefined) { return; }
          setCardDisplay(s.cardClass, vis[s.key]);
        });
        var state = gridLayoutState(vis);
        STYLE_CLASSES.forEach(function(c) {
          gridEl.classList.toggle(c, state.classes.indexOf(c) !== -1);
        });
        gridEl.style.setProperty('grid-template-areas', state.areasValue, 'important');
        gridEl.style.setProperty('grid-template-rows', state.rows, 'important');
      }
      refreshGate();
    };
    Array.prototype.forEach.call(boxes, function(box) {
      if (box._gstWired) { return; }
      box._gstWired = true;
      box.addEventListener('change', syncState);
    });
    Array.prototype.forEach.call(options, function(opt) {
      if (opt._gstWired) { return; }
      opt._gstWired = true;
      opt.addEventListener('click', function() {
        Array.prototype.forEach.call(options, function(o) {
          o.classList.remove('is-selected');
          o.setAttribute('aria-pressed', 'false');
        });
        opt.classList.add('is-selected');
        opt.setAttribute('aria-pressed', 'true');
        refreshGate();
        // (Per-layout preview swap is wired later.)
      });
    });
    syncState();
  } catch (e) { /* preview + gating are decorative — never block the step */ }

  // Orientation overlay (shown by CSS at ≤640px): Rotate tries a native
  // landscape lock; Continue Anyway hides it so the step stays usable in
  // portrait. Rotating to landscape widens past 640px and auto-hides it.
  try {
    var orientation = el.querySelector('.md-gst-orientation');
    var rotateBtn = orientation && orientation.querySelector('[data-gst-rotate]');
    var dismissBtn = orientation && orientation.querySelector('[data-gst-dismiss]');
    if (rotateBtn && !rotateBtn._gstWired) {
      rotateBtn._gstWired = true;
      rotateBtn.addEventListener('click', function() {
        try {
          if (window.screen && window.screen.orientation && window.screen.orientation.lock) {
            var p = window.screen.orientation.lock('landscape');
            if (p && p.catch) { p.catch(function() {}); }
          }
        } catch (e2) { /* web / unsupported — the width media query handles it */ }
      });
    }
    if (dismissBtn && !dismissBtn._gstWired) {
      dismissBtn._gstWired = true;
      dismissBtn.addEventListener('click', function() {
        if (orientation) { orientation.style.setProperty('display', 'none', 'important'); }
      });
    }
  } catch (e) { /* never block the step */ }
}

// Getting Started tour — a Shepherd-driven, single-page modal that shows
// progressive steps (starting with just a welcome page), mirroring the
// home-tour welcome modal's look + behavior. The component renders only the
// trigger badge; Shepherd portals the modal into <body>. It reuses the shared
// `tour` service: each addSteps() spins up a FRESH Shepherd.Tour (see
// ember-shepherd `_initialize`), so this never collides with the home tour.
// (Distinct from the existing `getting-started` checklist modal, which uses
// the `modal` service — this is the progressive tour-style experience.)
export default Component.extend({
  tagName: '',

  tour: service('tour'),
  appState: service('app-state'),

  // Persist the chosen display layout AND the per-section visibility to the
  // user's preferences. Called when the user advances past the "choose your
  // display style" step (Next), so both choices live-update and are referenced
  // on their next home-page render. No-ops if nothing changed / no signed-in
  // user. Mirrors the board_view_style save pattern: the device.updated dirty
  // bit forces ember-data to send the raw preferences.
  _persistDisplaySelection: function() {
    var user = this.get('appState.currentUser');
    if (!user) { return; }
    var changed = false;

    // Layout choice
    var sel = document.querySelector('.md-gst-modal--display .md-gst-option.is-selected');
    var layout = sel && sel.getAttribute('data-gst-layout');
    if (layout && user.get('preferences.dashboard_layout') !== layout) {
      user.set('preferences.dashboard_layout', layout);
      changed = true;
    }

    // Per-section visibility — build the map from the checked boxes, scoped to
    // the sections actually available to this user.
    var boxes = document.querySelectorAll('.md-gst-modal--display .md-gst-section__input');
    if (boxes.length) {
      var visibleKeys = [];
      Array.prototype.forEach.call(boxes, function(box) {
        if (box.checked) { visibleKeys.push(box.getAttribute('data-gst-section')); }
      });
      var map = sectionsMapFor(user, visibleKeys);
      var current = user.get('preferences.dashboard_sections') || {};
      var differs = Object.keys(map).some(function(k) {
        var cur = current[k];
        var curVisible = !(cur === false || cur === 'false');
        return curVisible !== map[k];
      });
      if (differs) {
        user.set('preferences.dashboard_sections', map);
        changed = true;
      }
    }

    if (changed) {
      user.set('preferences.device.updated', true);
      if (user.save) { user.save(); }
    }
  },

  // Eyebrow pill + heading, mirroring the home-tour decorated title. Shepherd
  // renders `title` via innerHTML, so an HTML string is the supported approach;
  // every piece comes from i18n, never user input.
  _decoratedTitle: function(headingKey, headingDefault) {
    var eyebrow = i18n.t('getting_started_tour_eyebrow', "Getting Started");
    var heading = i18n.t(headingKey, headingDefault);
    var spark = '<svg class="md-tour__eyebrow-icon" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l1.7 5.1 5.1 1.7-5.1 1.7L12 16.1l-1.7-5.1L5.2 9.3l5.1-1.7z"/><path d="M19 13.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" opacity="0.7"/></svg>';
    return '<span class="md-tour__eyebrow">' + spark +
           '<span class="md-tour__eyebrow-text">' + eyebrow + '</span></span>' +
           '<span class="md-tour__heading">' + heading + '</span>';
  },

  // The 3 layout option cards for the "choose your display style" step,
  // rendered as an HTML string into the Shepherd step text (Shepherd renders
  // `text` via innerHTML). Static i18n.t calls (NOT a loop with bound keys) so
  // the i18n_generator static parser can extract them. The cards are
  // non-functional for now — selection wiring lands later; data-gst-layout
  // marks each option's value for that hookup.
  _displayOptionsHtml: function() {
    // Pre-select the user's SAVED layout (default dynamic) so re-opening the
    // modal reflects what's stored, not a fixed default.
    var saved = this.get('appState.currentUser.preferences.dashboard_layout') || 'dynamic';
    if (['dynamic', 'focused', 'balanced'].indexOf(saved) === -1) { saved = 'dynamic'; }
    var option = function(key, num, label) {
      var sel = key === saved;
      return '<button type="button" class="md-gst-option' + (sel ? ' is-selected' : '') + '" data-gst-layout="' + key + '" aria-pressed="' + (sel ? 'true' : 'false') + '">' +
        '<span class="md-gst-option__num beta-welcome-steps__num">' + num + '</span>' +
        '<span class="md-gst-option__label">' + label + '</span>' +
      '</button>';
    };
    return '' +
      '<div class="md-gst-options">' +
        option('dynamic', '1', i18n.t('getting_started_tour_layout_dynamic', "Dynamic Layout")) +
        option('focused', '2', i18n.t('getting_started_tour_layout_focused', "Focused Layout")) +
        option('balanced', '3', i18n.t('getting_started_tour_layout_balanced', "Balanced Layout")) +
      '</div>' +
      this._dynamicPreviewHtml() +
      this._orientationOverlayHtml();
  },

  // Reuses the board-detail landscape-orientation overlay (same classes +
  // rotate animation) on this step. Always in the DOM; a ≤640px media query
  // shows it (and rotating to landscape widens past 640px, auto-hiding it).
  // IDs are namespaced so they never collide with the board-detail instance.
  _orientationOverlayHtml: function() {
    return '' +
      '<div class="md-board-detail-portrait-overlay md-gst-orientation" role="dialog" aria-label="' + i18n.t('board_detail_landscape_recommended', "Landscape mode recommended") + '">' +
        '<div class="md-board-detail-portrait-overlay__card">' +
          '<span class="md-board-detail-portrait-overlay__accent" aria-hidden="true"></span>' +
          '<div class="md-board-detail-portrait-overlay__phone" aria-hidden="true">' +
            '<svg class="md-board-detail-portrait-overlay__phone-arc" width="76" height="76" viewBox="0 0 76 76" fill="none" aria-hidden="true">' +
              '<defs>' +
                '<linearGradient id="md-gst-rot-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#5ED0C0"/><stop offset="100%" stop-color="#1C7E72"/></linearGradient>' +
                '<filter id="md-gst-rot-shadow" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="1.5" stdDeviation="2" flood-color="#2A9D8F" flood-opacity="0.5"/></filter>' +
              '</defs>' +
              '<g filter="url(#md-gst-rot-shadow)" fill="none" stroke-linecap="round" stroke-linejoin="round">' +
                '<path class="md-board-detail-portrait-overlay__arc-track" d="M34 14 C62 8 75 34 65 48" stroke="currentColor" stroke-width="3" stroke-opacity="0.20"/>' +
                '<path class="md-board-detail-portrait-overlay__arc-comet" d="M34 14 C62 8 75 34 65 48" pathLength="100" stroke="url(#md-gst-rot-grad)" stroke-width="3.5"/>' +
                '<polyline class="md-board-detail-portrait-overlay__arc-head" points="59 42 65 48 71 42" stroke="url(#md-gst-rot-grad)" stroke-width="3.5"/>' +
              '</g>' +
            '</svg>' +
            '<svg class="md-board-detail-portrait-overlay__phone-svg" width="76" height="76" viewBox="0 0 76 76" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
              '<rect x="30" y="24" width="16" height="28" rx="4.5"/><line x1="35" y1="47" x2="41" y2="47"/>' +
            '</svg>' +
          '</div>' +
          '<h2 class="md-board-detail-portrait-overlay__title">' + i18n.t('board_detail_landscape_recommended', "Landscape mode recommended") + '</h2>' +
          '<p class="md-board-detail-portrait-overlay__desc">' + i18n.t('getting_started_tour_landscape_explanation', "Rotate your device to landscape to see the full preview and choose your home page layout.") + '</p>' +
          '<div class="md-board-detail-portrait-overlay__actions">' +
            '<button type="button" class="md-board-detail-portrait-overlay__btn md-board-detail-portrait-overlay__btn--primary" data-gst-rotate>' + i18n.t('board_detail_rotate_device', "Rotate Device") + '</button>' +
            '<button type="button" class="md-board-detail-portrait-overlay__btn md-board-detail-portrait-overlay__btn--secondary" data-gst-dismiss>' + i18n.t('board_detail_continue_anyway', "Continue Anyway") + '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
  },

  // Compact, professional miniature of the Dynamic Layout (the current home
  // dashboard) shown below the options. Decorative (aria-hidden); the live
  // per-option preview swap is wired later. Built as an HTML string for the
  // Shepherd step text. The grid areas mirror the real home layout:
  // Caseload + Speak on top, Boards (tall) on the left, Extras + Org stacked
  // on the right.
  _dynamicPreviewHtml: function() {
    // The preview is a LIVE, scaled-down copy of THIS user's real home
    // dashboard — _onDisplayShow clones the actual `.md-grid--dashboard` into
    // `.md-gst-preview__live` so the user sees their exact home page, with all
    // its real cards/content, exactly as it will look at this layout.
    return '' +
      '<div class="md-gst-preview">' +
        '<div class="md-gst-preview__caption">' + i18n.t('getting_started_tour_preview_label', "Preview — Dynamic Layout") + '</div>' +
        this._sectionTogglesHtml() +
        '<div class="md-gst-preview__live">' +
          this._emptyOverlayHtml() +
        '</div>' +
      '</div>';
  },

  // Empty-state overlay shown over the preview when the user has every display
  // element unchecked — Next is disabled until they pick at least one. The live
  // clone itself is marked aria-hidden (decorative duplicate), so this overlay
  // carries the accessible status message.
  _emptyOverlayHtml: function() {
    return '' +
      '<div class="md-gst-empty" role="status" aria-live="polite">' +
        '<div class="md-gst-empty__card">' +
          '<svg class="md-gst-empty__icon" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>' +
          '<div class="md-gst-empty__title">' + i18n.t('getting_started_tour_empty_title', "Nothing to display") + '</div>' +
          '<div class="md-gst-empty__text">' + i18n.t('getting_started_tour_empty_text', "Select at least one element to display on your home page.") + '</div>' +
        '</div>' +
      '</div>';
  },

  // Modern checkbox list of the home-dashboard sections available to THIS user
  // (Boards/Speak/Extras always; Caseload + Organizations by user type). All
  // start checked unless the user previously hid one. Toggling a box live-hides
  // the matching card in the preview clone (wired in _onDisplayShow) and is
  // saved to preferences.dashboard_sections on Next.
  _sectionTogglesHtml: function() {
    var user = this.get('appState.currentUser');
    var items = availableHomeSections(user).map(function(s) {
      var checked = sectionHidden(user, s.key) ? '' : ' checked';
      return '' +
        '<label class="md-gst-section">' +
          '<input type="checkbox" class="md-gst-section__input" data-gst-section="' + s.key + '"' + checked + '>' +
          '<span class="md-gst-section__box" aria-hidden="true">' +
            '<svg class="md-gst-section__check" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' +
          '</span>' +
          '<span class="md-gst-section__label">' + sectionLabel(s) + '</span>' +
        '</label>';
    }).join('');
    return '' +
      '<div class="md-gst-sections">' +
        '<div class="md-gst-sections__title">' + i18n.t('getting_started_tour_sections_label', "Choose what appears on your home page") + '</div>' +
        '<div class="md-gst-sections__list">' + items + '</div>' +
      '</div>';
  },

  // Step script. Welcome page → "choose your display style" page. More steps
  // get appended here as the flow grows (footer Back/Next + progress dots come
  // from the home-tour styling we reuse).
  _buildSteps: function() {
    var component = this;
    return [
      // Step 1 — welcome (centered intro)
      {
        id: 'getting_started_tour_welcome',
        title: this._decoratedTitle('getting_started_tour_welcome_title', "Welcome to LingoLinq"),
        text: i18n.t('getting_started_tour_welcome_text', "Let's get you set up. We'll walk through a few quick steps to get your account ready to go."),
        // md-gst-modal scopes the size/position overrides to THIS modal so the
        // home-tour welcome/outro keep the shared intro default.
        classes: 'md-tour__step md-tour__step--intro md-gst-modal',
        buttons: [
          {
            text: i18n.t('getting_started_tour_skip', "Maybe later"),
            type: 'cancel',
            classes: 'md-tour__btn md-tour__btn--ghost'
          },
          {
            text: i18n.t('getting_started_tour_begin', "Get started"),
            type: 'next',
            classes: 'md-tour__btn md-tour__btn--primary'
          }
        ]
      },
      // Step 2 — choose your display style (3 layout option cards)
      {
        id: 'getting_started_tour_display',
        title: this._decoratedTitle('getting_started_tour_display_title', "Choose your display style"),
        text: this._displayOptionsHtml(),
        when: { show: _onDisplayShow },
        classes: 'md-tour__step md-tour__step--intro md-gst-modal md-gst-modal--display',
        buttons: [
          {
            text: i18n.t('getting_started_tour_back', "Back"),
            type: 'back',
            classes: 'md-tour__btn md-tour__btn--ghost'
          },
          {
            text: i18n.t('getting_started_tour_next', "Next"),
            // Custom action (not type:'next') so the chosen layout is saved to
            // the user's preference before advancing. The show hook keeps this
            // button disabled until an option is selected, so a selection is
            // always present here.
            action: function() {
              try { component._persistDisplaySelection(); } catch (e) { /* never block navigation */ }
              return this.next();
            },
            classes: 'md-tour__btn md-tour__btn--primary'
          }
        ]
      }
    ];
  },

  _startGettingStarted: function() {
    var tour = this.get('tour');
    if (!tour) { return; }
    // defaultStepOptions MUST be set before addSteps() (ember-shepherd reads
    // them when instantiating the fresh Shepherd.Tour). Mirrors home-tour.
    tour.set('confirmCancel', false);
    tour.set('modal', true);
    tour.set('defaultStepOptions', {
      classes: 'md-tour__step',
      cancelIcon: { enabled: true },
      scrollTo: { behavior: 'auto', block: 'center' },
      modalOverlayOpeningPadding: 0,
      modalOverlayOpeningRadius: 14,
      when: { show: _onShow }
    });
    // Clear the page down to brand + identity + dimmed bg while the series runs.
    try { document.body.classList.add('md-gst-active'); } catch (e) { /* noop */ }
    tour.addSteps(this._buildSteps()).then(function() {
      if (tour.tourObject) {
        tour.tourObject.on('complete', _clearCentered);
        tour.tourObject.on('cancel', _clearCentered);
      }
      tour.start();
    });
  },

  actions: {
    startGettingStarted: function() {
      this._startGettingStarted();
    }
  }
});
