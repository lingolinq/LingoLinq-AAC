import Component from '@ember/component';
import { inject as service } from '@ember/service';
import i18n from '../utils/i18n';
import { availableHomeSections, sectionHidden, sectionLabel, sectionsMapFor, HOME_SECTIONS, gridLayoutState, AREA, boardsCells } from '../utils/dashboard_sections';

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

// Show hook for the welcome (first) page: run the shared centered-step setup, then
// wire the two showcase cards so clicking either advances into the flow (the same
// as the footer "Get started"). `this` is the active Shepherd Step.
function _onWelcomeShow() {
  var step = this;
  try { _onShow.call(step); } catch (e) { /* shared setup is decorative */ }
  try {
    var el = step.el;
    if (!el) { return; }
    Array.prototype.forEach.call(el.querySelectorAll('[data-gst-welcome-target]'), function(card) {
      if (card._gstWired) { return; }
      card._gstWired = true;
      card.addEventListener('click', function() {
        // Jump to the card's target step by id (display vs. customize), so clicking
        // "Customize your home page" skips straight to that step. Falls back to the
        // next step if the id can't be resolved.
        var target = card.getAttribute('data-gst-welcome-target');
        try {
          if (target && step.tour && step.tour.show) { step.tour.show(target); }
          else if (step.tour && step.tour.next) { step.tour.next(); }
        } catch (e2) { /* never block the step */ }
      });
    });
  } catch (e) { /* wiring is an enhancement — never block the step */ }
}

// Swap the two cards' CURRENTLY-DISPLAYED cells so that ONLY a and b move — a pure
// pairwise swap. `positions[X]` = the card shown in base-cell X (default X). A card
// that's already been rearranged no longer sits in its own base-cell, so we must
// find the base-cell each card currently occupies and swap THOSE cells' owners —
// swapping `positions[a]`/`positions[b]` directly would target the base-cells named
// a/b (where other cards may now sit) and cascade into a 3-cycle that wrongly
// displaces a third card. Keeps the map a closed permutation; identity entries are
// dropped so an unchanged map round-trips as {}.
function _swapPositions(positions, a, b) {
  var cellA = a, cellB = b;
  Object.keys(positions).forEach(function(x) {
    if (positions[x] === a) { cellA = x; }
    if (positions[x] === b) { cellB = x; }
  });
  positions[cellA] = b;
  positions[cellB] = a;
  if (positions[cellA] === cellA) { delete positions[cellA]; }
  if (positions[cellB] === cellB) { delete positions[cellB]; }
}

// Compute the next Boards placement descriptor when Boards is dropped onto a target
// card. Locates Boards' current column + the target's column in the rendered layout:
// dropping on a card in BOARDS' OWN column → vertical swap (toggle `raised`); dropping
// on a card in the OTHER column → mirror (flip `side`, which swaps the column widths).
// Returns null if either column can't be resolved (safe no-op).
function _boardsDropPlacement(vis, positions, boards, targetKey) {
  var areas = gridLayoutState(vis, positions, boards).areas;
  var bc = boardsCells(areas);
  if (bc.col < 0) { return null; }
  var tArea = AREA[targetKey];
  var tcol = -1;
  areas.forEach(function(row) {
    var t = row.split(' ');
    if (t[0] === tArea) { tcol = 0; } else if (t[1] === tArea) { tcol = 1; }
  });
  if (tcol < 0) { return null; }
  var next = { side: (boards && boards.side === 'right') ? 'right' : 'left', raised: !!(boards && boards.raised) };
  if (tcol === bc.col) { next.raised = !next.raised; }
  else { next.side = next.side === 'right' ? 'left' : 'right'; }
  return next;
}

// Cell id ("rowIndex,col") where a given grid-area name sits in an areas array —
// i.e. where the card with that grid-area is displayed.
function _cellOf(areas, areaName) {
  for (var i = 0; i < areas.length; i++) {
    var t = areas[i].split(' ');
    if (t[0] === areaName) { return i + ',0'; }
    if (t[1] === areaName) { return i + ',1'; }
  }
  return null;
}

// The areas that WOULD result if srcKey were dropped on dstKey — used to preview
// which cards move. Returns null for a no-op drop (small card onto Boards).
function _nextAreas(vis, positions, boards, srcKey, dstKey) {
  if (srcKey === 'boards') {
    var np = _boardsDropPlacement(vis, positions, boards, dstKey);
    return np ? gridLayoutState(vis, positions, np).areas : null;
  }
  if (dstKey === 'boards') { return null; }
  var copy = {};
  Object.keys(positions).forEach(function(k) { copy[k] = positions[k]; });
  _swapPositions(copy, srcKey, dstKey);
  return gridLayoutState(vis, copy, boards).areas;
}

// Keys of every card that would change cells (be "swapped out") if srcKey were
// dropped on dstKey — excluding the dragged source itself. Drives the drop-target
// highlight so ALL displaced cards light up (e.g. the two cards a Boards mirror
// covers), not just the one under the pointer.
function _displacedKeys(vis, positions, boards, srcKey, dstKey) {
  var current = gridLayoutState(vis, positions, boards).areas;
  var next = _nextAreas(vis, positions, boards, srcKey, dstKey);
  if (!next) { return []; }
  var out = [];
  Object.keys(AREA).forEach(function(key) {
    if (key === srcKey) { return; }
    if (_cellOf(current, AREA[key]) !== _cellOf(next, AREA[key])) { out.push(key); }
  });
  return out;
}

// Wire pointer-based drag-to-swap on the preview clone's cards (flagged feature).
// Native HTML5 DnD is a non-starter here — the cards are nested buttons/links and
// the clone is `pointer-events:none`. Rather than re-enable pointer-events on the
// CARD (which would re-activate its hover lift/glow), we lay a transparent OVERLAY
// over each swappable card: the overlay carries pointer-events + the grab cursor +
// `touch-action:none`, while the card itself stays inert and so never enters
// :hover. Boards is excluded (the spanning hero). On drop over another card we swap
// their slots and call onChange() to re-render. No ghost — the source dims, the
// hovered target highlights, release commits — which avoids self-hit-testing math.
function _wirePreviewDrag(liveEl, ctx) {
  var positions = ctx.positions, boards = ctx.boards, onChange = ctx.onChange;
  // The preview is rendered at a CSS zoom; a CSS translate on a card inside it
  // renders at translate × zoom on screen. Divide the screen-space cursor delta by
  // the zoom so the dragged ghost tracks the pointer 1:1 (defaults to 1 / no zoom).
  var scale = ctx.scale || 1;
  var cards = [];
  var state = null;
  // Resolve the (key, card) under a viewport point, SKIPPING the dragged card (which
  // is translated under the cursor). We walk elementsFromPoint top→bottom rather than
  // toggling pointer-events on the captured overlay (which could drop the capture
  // mid-drag): for each stacked element we climb to its host card; the dragged card
  // is skipped so we land on the target beneath it.
  var keyAt = function(x, y, excludeCard) {
    var stack = document.elementsFromPoint(x, y);
    for (var i = 0; i < stack.length; i++) {
      var el = stack[i];
      while (el && el !== liveEl) {
        if (el.getAttribute && el.hasAttribute('data-gst-key')) {
          var card = el.classList.contains('md-gst-draggable') ? el : el.parentNode;
          if (card !== excludeCard) { return { key: el.getAttribute('data-gst-key'), card: card }; }
          break; // this stacked hit is the dragged card — try the next element down
        }
        el = el.parentNode;
      }
    }
    return null;
  };
  var clearTargets = function() {
    cards.forEach(function(c) { c.classList.remove('md-gst-drop-target'); });
  };
  // Highlight every card that would be displaced by this drop (by key).
  var highlight = function(keys) {
    cards.forEach(function(c) {
      if (keys.indexOf(c.getAttribute('data-gst-key')) !== -1) { c.classList.add('md-gst-drop-target'); }
    });
  };
  // One rAF per frame coalesces the (many) pointermove events: we move the ghost with
  // a GPU translate3d every frame, but only re-hit-test + recompute the displaced
  // highlight when the hovered target actually CHANGES — so dragging stays smooth
  // instead of thrashing layout on every event.
  var raf = (typeof window !== 'undefined' && window.requestAnimationFrame) ? window.requestAnimationFrame.bind(window) : function(cb) { return setTimeout(cb, 16); };
  var caf = (typeof window !== 'undefined' && window.cancelAnimationFrame) ? window.cancelAnimationFrame.bind(window) : clearTimeout;
  var scheduleFrame = function() {
    if (!state || state.frame) { return; }
    state.frame = raf(function() {
      if (!state) { return; }
      state.frame = 0;
      state.card.style.setProperty('transform', 'translate3d(' + ((state.x - state.startX) / scale) + 'px,' + ((state.y - state.startY) / scale) + 'px,0)', 'important');
      var hit = keyAt(state.x, state.y, state.card);
      var hitKey = (hit && hit.key !== state.key) ? hit.key : null;
      if (hitKey !== state.lastHit) {
        state.lastHit = hitKey;
        clearTargets();
        if (hitKey) { highlight(_displacedKeys(ctx.getVis(), positions, boards, state.key, hitKey)); }
      }
    });
  };
  // Apply a completed drop. Boards (the hero) moves structurally — dropped on a
  // card it computes a new placement; everything else is an equal small-card swap.
  // A small card dropped on Boards is a no-op (Boards only moves when itself dragged).
  var commitDrop = function(srcKey, dstKey) {
    if (srcKey === 'boards') {
      var np = _boardsDropPlacement(ctx.getVis(), positions, boards, dstKey);
      if (np) { boards.side = np.side; boards.raised = np.raised; onChange(); }
    } else if (dstKey === 'boards') {
      /* small card onto Boards — no-op */
    } else {
      _swapPositions(positions, srcKey, dstKey);
      onChange();
    }
  };
  HOME_SECTIONS.forEach(function(s) {
    Array.prototype.forEach.call(liveEl.querySelectorAll('.' + s.cardClass), function(card) {
      if (card._gstDragWired) { return; }
      card._gstDragWired = true;
      card.classList.add('md-gst-draggable');
      card.setAttribute('data-gst-key', s.key);
      // Kill the card's hover lift/glow in the preview. The drag overlay below is a
      // DESCENDANT, so hovering it still marks the card :hover (CSS :hover matches the
      // hovered node AND its ancestors) — and the lift rules out-specify any class
      // override (up to 0,5,0). Pinning transform + the resting box-shadow inline with
      // !important beats every stylesheet hover rule regardless of specificity, so the
      // card stays visually static. Resting box-shadow is read now (pre-hover).
      card.style.setProperty('transform', 'none', 'important');
      var restShadow = (typeof window !== 'undefined' && window.getComputedStyle) ? window.getComputedStyle(card).boxShadow : '';
      if (restShadow && restShadow !== 'none') { card.style.setProperty('box-shadow', restShadow, 'important'); }
      var ov = document.createElement('div');
      ov.className = 'md-gst-drag-overlay';
      ov.setAttribute('aria-hidden', 'true');
      ov.setAttribute('data-gst-key', s.key);
      card.appendChild(ov);
      cards.push(card);
      // The clone is a non-interactive preview, but its cards are real <button>/<a>
      // elements (cloneNode kept their href + Ember action attributes). The click
      // that fires on pointer-up would bubble into the card and trigger its action /
      // navigation — closing the modal and changing route. Swallow clicks on the
      // overlay so a drag (or a stray tap) never fires the underlying card.
      ov.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
      });
      ov.addEventListener('pointerdown', function(e) {
        if (e.button != null && e.button > 0) { return; }
        // Ghost: lift the card out (dimmed via .md-gst-dragging) and let it follow
        // the cursor by translating it — z-index above its siblings.
        state = { key: s.key, card: card, ov: ov, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, lastHit: null, frame: 0 };
        card.classList.add('md-gst-dragging');
        card.style.setProperty('z-index', '999', 'important');
        try { ov.setPointerCapture(e.pointerId); } catch (e2) { /* unsupported — drag still works without capture */ }
        e.preventDefault();
      });
      ov.addEventListener('pointermove', function(e) {
        if (!state) { return; }
        state.x = e.clientX;
        state.y = e.clientY;
        scheduleFrame();
      });
      var finish = function(e) {
        if (!state) { return; }
        var src = state;
        state = null;
        if (src.frame) { caf(src.frame); }
        var hit = keyAt(e.clientX, e.clientY, src.card);
        // Drop the ghost back into the grid (transform pinned to none keeps hover
        // suppressed); a re-render after commit snaps it to its new cell.
        src.card.classList.remove('md-gst-dragging');
        src.card.style.setProperty('transform', 'none', 'important');
        src.card.style.removeProperty('z-index');
        clearTargets();
        try { src.ov.releasePointerCapture(e.pointerId); } catch (e2) { /* noop */ }
        if (hit && hit.key !== src.key) {
          commitDrop(src.key, hit.key);
        }
      };
      ov.addEventListener('pointerup', finish);
      ov.addEventListener('pointercancel', finish);
    });
  });
}

// ── Layout-aware preview content ────────────────────────────────────────────
// The read-only preview shows what the SELECTED layout looks like by cloning the
// user's real dashboard grid into a single `.md-gst-preview__page`, swapped
// wholesale when the layout changes (Dynamic vs Balanced).
function _buildDynamicClone(live) {
  var src = document.querySelector('.md-grid--dashboard:not(.md-gst-preview__clone)');
  if (!src) { return; }
  var page = document.createElement('div');
  page.className = 'md-gst-preview__page';
  page.setAttribute('aria-hidden', 'true');
  var clone = src.cloneNode(true);
  clone.removeAttribute('id');
  Array.prototype.forEach.call(clone.querySelectorAll('[id]'), function(n) { n.removeAttribute('id'); });
  Array.prototype.forEach.call(clone.querySelectorAll('a, button, input, [tabindex]'), function(n) { n.setAttribute('tabindex', '-1'); });
  // Make the preview INERT (strip href + Ember action attrs so a stray click can't
  // navigate / tear down the modal; the drag overlay also swallows clicks).
  Array.prototype.forEach.call(clone.querySelectorAll('a[href]'), function(n) { n.removeAttribute('href'); });
  Array.prototype.forEach.call(clone.querySelectorAll('[data-ember-action]'), function(n) {
    Array.prototype.slice.call(n.attributes).forEach(function(attr) {
      if (attr.name.indexOf('data-ember-action') === 0) { n.removeAttribute(attr.name); }
    });
  });
  clone.classList.add('md-gst-preview__clone');
  page.appendChild(clone);
  live.appendChild(page);
}

// Swap the preview content. Removes the existing page first so switching styles
// (re-clicking a style card) re-renders cleanly.
function _buildPreviewContent(live) {
  if (!live) { return; }
  try {
    var existing = live.querySelector('.md-gst-preview__page');
    if (existing && existing.parentNode) { existing.parentNode.removeChild(existing); }
    _buildDynamicClone(live);
  } catch (e) { /* preview is decorative — never block the step */ }
}

// Show hook for the "choose your display style" step: runs the shared
// centered-step setup, then GATES the Next button on a selection — Next starts
// disabled and only enables once the user picks a layout option (single-select).
function _onDisplayShow(component) {
  var step = this;
  try { _onShow.call(step); } catch (e) { /* shared setup is decorative */ }
  var el = step.el;
  if (!el) { return; }
  // Auto-save the selection on each user change, DEBOUNCED off the interaction frame.
  // Why this shape:
  //  - Shepherd calls step.destroy() — not hide() — on BOTH Done (complete) and close
  //    (cancel), and destroy detaches the element + nulls this.el before any handler
  //    runs, so a save deferred to the close LIFECYCLE reads a torn-down DOM. (That
  //    was why Done / closing stopped saving.)
  //  - But saving SYNCHRONOUSLY on every drop would run user.set → home re-render on
  //    the drop's snap frame and make rapid rearranging feel heavy/jumpy.
  // So: debounce. Rapid drags/toggles coalesce into ONE save that runs after the
  // interaction settles — never on the animation frame. Close-safe WITHOUT a lifecycle
  // hook: this closure captures the element OBJECT, and destroy() only `.remove()`s it
  // (the detached node keeps its stamped data-gst-positions), so a trailing save that
  // fires after the modal closes still reads the final arrangement. The pending timer
  // survives the close (no app navigation), so the last change is always persisted.
  var persist = function() { if (component) { try { component._persistDisplaySelection(el); } catch (e) { /* never block interaction */ } } };
  var saveTimer = null;
  var queuePersist = function() {
    if (saveTimer) { clearTimeout(saveTimer); }
    saveTimer = setTimeout(function() { saveTimer = null; persist(); }, 180);
  };

  // Build the preview content — a clone of the user's real dashboard (see
  // _buildPreviewContent). The layout-card click handler rebuilds it when the choice
  // changes so the preview always matches.
  try {
    var live = el.querySelector('.md-gst-preview__live');
    if (live && !live.querySelector('.md-gst-preview__page')) {
      _buildPreviewContent(live);
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
    // Label the preview legend with the layout the user has selected (mirrors
    // component._previewLabel; defined here because _onDisplayShow is a module
    // function with no component `this`). Updated on show (re-seed) and on each
    // style-card click so "Preview — X Layout" always names the current choice.
    var previewLabelFor = function(layout) {
      if (layout === 'balanced') { return i18n.t('getting_started_tour_preview_label_balanced', "Preview — Balanced Layout"); }
      return i18n.t('getting_started_tour_preview_label', "Preview — Dynamic Layout");
    };
    var setPreviewLabel = function(layout) {
      var tag = el.querySelector('.md-gst-preview__legend-tag');
      if (tag) { tag.textContent = previewLabelFor(layout); }
    };
    // Re-seed THIS page from the CURRENT saved preferences at show time. Shepherd
    // builds every step's HTML once (at tour start), so without this a later page
    // (the copy) — or any re-shown page — would display the state captured when the
    // modal opened, not edits made on an earlier page, and saving it would clobber
    // those edits. Re-sync the layout selection, the section checkboxes, and the
    // stamped positions/boards from the live preferences so each page always reflects
    // (and persists from) the latest saved state.
    try {
      var _appState = (typeof window !== 'undefined' && window.LingoLinq) ? window.LingoLinq.appState : null;
      var _seedUser = _appState && _appState.get('currentUser');
      if (_seedUser && liveEl) {
        var _savedLayout = _seedUser.get('preferences.dashboard_layout') || 'dynamic';
        if (['dynamic', 'balanced'].indexOf(_savedLayout) === -1) { _savedLayout = 'dynamic'; }
        Array.prototype.forEach.call(el.querySelectorAll('.md-gst-option'), function(opt) {
          var on = opt.getAttribute('data-gst-layout') === _savedLayout;
          opt.classList.toggle('is-selected', on);
          opt.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        setPreviewLabel(_savedLayout);
        Array.prototype.forEach.call(el.querySelectorAll('.md-gst-section__input'), function(box) {
          box.checked = !sectionHidden(_seedUser, box.getAttribute('data-gst-section'));
        });
        var _sp = _seedUser.get('preferences.dashboard_positions');
        var _sb = _seedUser.get('preferences.dashboard_boards');
        liveEl.setAttribute('data-gst-positions', JSON.stringify((_sp && typeof _sp === 'object') ? _sp : {}));
        liveEl.setAttribute('data-gst-boards', JSON.stringify((_sb && typeof _sb === 'object') ? _sb : {}));
      }
    } catch (e) { /* re-seed is best-effort — falls back to the stamped HTML */ }
    // Drag-to-swap state (flagged): the saved arrangement + whether the flag is
    // on are stamped onto the live element by _dynamicPreviewHtml. We mutate this
    // `positions` map on each swap and stamp it back onto the live element so
    // _persistDisplaySelection can read the final arrangement to save.
    var positions = {};
    var boards = {};
    var dragEnabled = false;
    if (liveEl) {
      try { positions = JSON.parse(liveEl.getAttribute('data-gst-positions') || '{}') || {}; } catch (e) { positions = {}; }
      try { boards = JSON.parse(liveEl.getAttribute('data-gst-boards') || '{}') || {}; } catch (e) { boards = {}; }
      dragEnabled = liveEl.getAttribute('data-gst-drag') === '1';
    }
    // The saved arrangement is applied to the preview whenever the feature flag is
    // on — even on the read-only display-style page (drag off) — so its preview
    // mirrors the real home page rather than a default arrangement. `dragEnabled`
    // (this page's data-gst-drag) separately controls whether dragging is WIRED.
    var flagOn = dragEnabled;
    var previewUser = null;
    try {
      var _flagState = (typeof window !== 'undefined' && window.LingoLinq) ? window.LingoLinq.appState : null;
      if (_flagState) {
        flagOn = !!_flagState.get('feature_flags.dashboard_drag_layout');
        previewUser = _flagState.get('currentUser');
      }
    } catch (e) { flagOn = dragEnabled; }
    var boxes = el.querySelectorAll('.md-gst-section__input');
    var options = el.querySelectorAll('.md-gst-option');
    var nextBtn = el.querySelector('.shepherd-footer .md-tour__btn--primary');
    var overlay = el.querySelector('.md-gst-empty');
    var STYLE_CLASSES = ['md-grid--with-caseload', 'md-grid--with-org-mgmt', 'md-grid--boards-right', 'md-grid--boards-full'];
    var readVis = function() {
      var vis = {};
      // Pages WITH toggles (home-layout) read live checkbox state. Pages WITHOUT
      // toggles (read-only display-style preview) have no checkboxes, so derive
      // visibility from the user's SAVED sections — otherwise vis is empty,
      // gridLayoutState places no cells, and the still-visible cards overflow at
      // full size instead of laying out in the compact grid.
      if (!boxes.length && previewUser) {
        availableHomeSections(previewUser).forEach(function(s) {
          vis[s.key] = !sectionHidden(previewUser, s.key);
        });
        return vis;
      }
      Array.prototype.forEach.call(boxes, function(box) {
        vis[box.getAttribute('data-gst-section')] = box.checked;
      });
      return vis;
    };

    var anyChecked = function() {
      var any = false;
      Array.prototype.forEach.call(boxes, function(b) { if (b.checked) { any = true; } });
      return any;
    };
    // Next requires a layout choice AND at least one display element; the empty
    // overlay appears whenever zero elements are selected.
    // Gate adapts to whichever controls THIS page has: the display-style page has
    // style cards but no toggles (require a layout); the home-layout page has
    // toggles but no cards (require at least one section). A control type that's
    // absent on a page is treated as satisfied so it never blocks Next.
    var refreshGate = function() {
      var hasSection = (boxes.length === 0) ? true : anyChecked();
      var hasLayout = (options.length === 0) ? true : !!el.querySelector('.md-gst-option.is-selected');
      var disabled = !(hasSection && hasLayout);
      if (nextBtn) {
        nextBtn.disabled = disabled;
        nextBtn.classList.toggle('md-tour__btn--disabled', disabled);
        nextBtn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
      }
      // The empty-state overlay only applies where the toggles live (home-layout page).
      if (overlay) { overlay.classList.toggle('is-visible', boxes.length > 0 && !hasSection); }
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
    var currentLayout = function() {
      var sel = el.querySelector('.md-gst-option.is-selected');
      if (sel) { return sel.getAttribute('data-gst-layout') || 'dynamic'; }
      try {
        var as = (typeof window !== 'undefined' && window.LingoLinq) ? window.LingoLinq.appState : null;
        return (as && as.get('currentUser.preferences.dashboard_layout')) || 'dynamic';
      } catch (e) { return 'dynamic'; }
    };
    var applyLayoutSections = function(layout) {
      var balanced = (layout === 'balanced');
      Array.prototype.forEach.call(boxes, function(box) {
        var key = box.getAttribute('data-gst-section');
        var row = box.closest('.md-gst-section');
        if (!row) { return; }
        // Balanced offers everything EXCEPT Extras (Speak becomes the full-width
        // hero, Extras never shows); Dynamic offers the full checklist.
        row.style.display = (balanced && key === 'extras') ? 'none' : '';
      });
    };
    var syncState = function() {
      // Re-query the clone each call — the preview content is rebuilt when the layout
      // changes, so a captured reference would go stale.
      gridEl = liveEl && liveEl.querySelector('.md-gst-preview__clone');
      var layout = currentLayout();
      var vis = readVis();
      // Balanced never shows Extras — Speak becomes the full-width hero instead.
      // Force it off before card-hide + layout so the clone matches the real page.
      if (layout === 'balanced') { vis.extras = false; }
      if (liveEl && gridEl) {
        // Reflect the selected display style on the clone so layout-scoped CSS
        // (e.g. the Balanced full-width Speak hero's doubled height) applies to
        // the preview too — the clone inherits the live grid's layout class, so
        // it must be re-stamped when the user switches styles.
        ['dynamic', 'balanced'].forEach(function(name) {
          gridEl.classList.toggle('md-grid--layout-' + name, layout === name);
        });
        HOME_SECTIONS.forEach(function(s) {
          if (vis[s.key] === undefined) { return; }
          setCardDisplay(s.cardClass, vis[s.key]);
        });
        var state = gridLayoutState(vis, flagOn ? positions : null, flagOn ? boards : null, layout);
        STYLE_CLASSES.forEach(function(c) {
          gridEl.classList.toggle(c, state.classes.indexOf(c) !== -1);
        });
        gridEl.style.setProperty('grid-template-areas', state.areasValue, 'important');
        gridEl.style.setProperty('grid-template-rows', state.rows, 'important');
        // Stamp the live arrangement back so the persist step can read it.
        liveEl.setAttribute('data-gst-positions', JSON.stringify(positions));
        liveEl.setAttribute('data-gst-boards', JSON.stringify(boards));
      }
      refreshGate();
    };
    // A user-initiated change: re-render the preview IMMEDIATELY (the snap stays
    // instant) then queue a DEBOUNCED save (off the animation frame). The initial
    // syncState() below calls syncState directly — NOT this — so opening the modal
    // never triggers a save.
    var onUserChange = function() { syncState(); queuePersist(); };
    Array.prototype.forEach.call(boxes, function(box) {
      if (box._gstWired) { return; }
      box._gstWired = true;
      box.addEventListener('change', onUserChange);
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
        var chosen = opt.getAttribute('data-gst-layout');
        // Reflect the chosen style in the preview: update the legend label AND rebuild
        // the preview content (the dashboard clone), then re-apply the arrangement
        // via syncState.
        setPreviewLabel(chosen);
        _buildPreviewContent(liveEl);
        applyLayoutSections(chosen);
        syncState();
        refreshGate();
        // Save the chosen layout IMMEDIATELY (not debounced) — picking a style is a
        // discrete click, so the user's dashboard_layout pref updates the instant
        // they choose, and the dashboard behind the modal reflows right away.
        persist();
      });
    });
    applyLayoutSections(currentLayout());
    syncState();
    // Drag-to-swap (flagged): let the user rearrange cards by dragging one onto
    // another in the preview. Each swap re-runs syncState (re-rendering the grid
    // and re-stamping the positions for persistence).
    if (dragEnabled && liveEl) {
      // The preview is rendered at a CSS `zoom` (single source of truth: the
      // --md-gst-preview-zoom custom property). A child's CSS translate renders at
      // translate × zoom on screen, so pass the zoom factor through — the drag math
      // divides by it to keep the ghost 1:1 under the cursor.
      var previewZoom = 1;
      try { previewZoom = parseFloat(window.getComputedStyle(liveEl).getPropertyValue('--md-gst-preview-zoom')) || 1; } catch (e) { previewZoom = 1; }
      try { _wirePreviewDrag(liveEl, { positions: positions, boards: boards, getVis: readVis, onChange: onUserChange, scale: previewZoom }); } catch (e) { /* drag is an enhancement — never block the step */ }
    }
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

  // Persist the chosen display layout + per-section visibility/positions/boards to
  // the user's preferences. Called on Next from the "choose your display style" step.
  //
  // IMPORTANT — ember-data only detects REFERENCE changes on a `raw`/object attr; an
  // in-place nested mutation (`set('preferences.x', …)`) leaves hasDirtyAttributes
  // false, so the change is never serialized/saved on a re-save (verified in console;
  // documented Ember Data limitation — discuss.emberjs.com threads on "hasDirtyAttributes
  // … nested attributes"). The fix is the community-standard one: NEVER mutate the
  // model's object — copy `preferences`, edit the COPY, and `set('preferences', copy)`
  // once. The fresh reference makes ember-data mark it dirty (→ sent to the server) AND
  // fires the property change (→ the home grid computeds recompute / re-render).
  _persistDisplaySelection: function(root) {
    var user = this.get('appState.currentUser');
    if (!user) { return; }
    // Scope every DOM read to THIS step's element so multiple display pages (the
    // original config step + the copy that follows it) persist independently and
    // never read each other's controls. Falls back to the first display modal in
    // the DOM when no root is passed (single-step callers).
    root = root || document.querySelector('.md-gst-modal--display');
    if (!root) { return; }
    var prefs = Object.assign({}, user.get('preferences') || {});
    var changed = false;
    var norm = function(o) {
      var out = {};
      Object.keys(o || {}).sort().forEach(function(k) { out[k] = o[k]; });
      return JSON.stringify(out);
    };

    // Layout choice
    var sel = root.querySelector('.md-gst-option.is-selected');
    var layout = sel && sel.getAttribute('data-gst-layout');
    if (layout && prefs.dashboard_layout !== layout) {
      prefs.dashboard_layout = layout;
      changed = true;
    }

    // Per-section visibility — build the map from the checked boxes, scoped to
    // the sections actually available to this user.
    var boxes = root.querySelectorAll('.md-gst-section__input');
    if (boxes.length) {
      var visibleKeys = [];
      Array.prototype.forEach.call(boxes, function(box) {
        if (box.checked) { visibleKeys.push(box.getAttribute('data-gst-section')); }
      });
      var map = sectionsMapFor(user, visibleKeys);
      var current = prefs.dashboard_sections || {};
      var differs = Object.keys(map).some(function(k) {
        var cur = current[k];
        var curVisible = !(cur === false || cur === 'false');
        return curVisible !== map[k];
      });
      if (differs) {
        prefs.dashboard_sections = map;
        changed = true;
      }
    }

    // Per-section drag-to-swap positions + Boards placement (flagged) — read the final
    // arrangement the show hook stamped onto the live element. Compared with sorted
    // keys so key ordering alone never triggers a needless save.
    var live = root.querySelector('.md-gst-preview__live');
    if (live && live.getAttribute('data-gst-drag') === '1') {
      var positions = {};
      try { positions = JSON.parse(live.getAttribute('data-gst-positions') || '{}') || {}; } catch (e) { positions = {}; }
      if (norm(positions) !== norm(prefs.dashboard_positions || {})) {
        prefs.dashboard_positions = positions;
        changed = true;
      }
      var boards = {};
      try { boards = JSON.parse(live.getAttribute('data-gst-boards') || '{}') || {}; } catch (e) { boards = {}; }
      if (norm(boards) !== norm(prefs.dashboard_boards || {})) {
        prefs.dashboard_boards = boards;
        changed = true;
      }
    }

    if (changed) {
      // Bump the device dirty bit on a COPY too (never mutate the original device obj).
      prefs.device = Object.assign({}, prefs.device || {}, { updated: true });
      // Whole-attribute set with a FRESH object reference → ember-data registers a real
      // change (serialized + saved) and fires the property change (home re-renders).
      user.set('preferences', prefs);
      if (user.save) { user.save(); }
    }
  },

  // Welcome (first) page content (HTML string — Shepherd renders `text` via
  // innerHTML). A short lead, a horizontal 1→2 progress stepper (reusing the
  // .beta-welcome-steps__num glass badges + a connecting line), and two button
  // cards that preview the next two steps as mini-mockups. Every string is static
  // i18n.t (generator-friendly); the layout-chooser + customize step titles are
  // reused so the cards name exactly what's coming. `data-gst-welcome-next` cards
  // advance the tour (wired in _onWelcomeShow).
  _welcomeContentHtml: function() {
    var lead = i18n.t('getting_started_tour_welcome_text', "Let's get you set up. We'll walk through a few quick steps to get your account ready to go.");
    var t1 = i18n.t('getting_started_tour_display_title', "Choose your display style");
    var d1 = i18n.t('getting_started_tour_welcome_card1_desc', "Pick the home-page layout that fits how you like to work.");
    var t2 = i18n.t('getting_started_tour_layout_title', "Customize your home page");
    var d2 = i18n.t('getting_started_tour_welcome_card2_desc', "Choose what appears and arrange it your way.");
    // Decorative mini-mockup of the layout chooser: three stacked option rows, the
    // first one "selected".
    var mock1 = '<span class="md-gst-wc-mock md-gst-wc-mock--layouts" aria-hidden="true">' +
        '<span class="md-gst-wc-opt is-active"></span>' +
        '<span class="md-gst-wc-opt"></span>' +
        '<span class="md-gst-wc-opt"></span>' +
      '</span>';
    // Decorative mini-mockup of a home dashboard: a wide hero tile + a 2-up row.
    var mock2 = '<span class="md-gst-wc-mock md-gst-wc-mock--grid" aria-hidden="true">' +
        '<span class="md-gst-wc-tile md-gst-wc-tile--hero"></span>' +
        '<span class="md-gst-wc-tile"></span>' +
        '<span class="md-gst-wc-tile"></span>' +
      '</span>';
    var card = function(target, mock, title, desc) {
      return '<button type="button" class="md-gst-welcome-card" data-gst-welcome-target="' + target + '">' +
          mock +
          '<span class="md-gst-welcome-card__title">' + title + '</span>' +
          '<span class="md-gst-welcome-card__desc">' + desc + '</span>' +
        '</button>';
    };
    return '' +
      '<div class="md-gst-welcome">' +
        '<p class="md-gst-welcome__lead">' + lead + '</p>' +
        '<div class="md-gst-welcome__progress" aria-hidden="true">' +
          '<span class="md-gst-welcome__num beta-welcome-steps__num">1</span>' +
          '<span class="md-gst-welcome__line"></span>' +
          '<span class="md-gst-welcome__num beta-welcome-steps__num">2</span>' +
        '</div>' +
        '<div class="md-gst-welcome__cards">' +
          // Card 1 → the display-style step; card 2 jumps straight to the
          // customize step (skipping style selection) — see _onWelcomeShow.
          card('getting_started_tour_display', mock1, t1, d1) +
          card('getting_started_tour_layout', mock2, t2, d2) +
        '</div>' +
      '</div>';
  },

  // Eyebrow pill + heading, mirroring the home-tour decorated title. Shepherd
  // renders `title` via innerHTML, so an HTML string is the supported approach;
  // every piece comes from i18n, never user input.
  _decoratedTitle: function(headingKey, headingDefault) {
    var eyebrow = i18n.t('getting_started_tour_eyebrow', "Dashboard Design");
    var heading = i18n.t(headingKey, headingDefault);
    var spark = '<svg class="md-tour__eyebrow-icon" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l1.7 5.1 5.1 1.7-5.1 1.7L12 16.1l-1.7-5.1L5.2 9.3l5.1-1.7z"/><path d="M19 13.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" opacity="0.7"/></svg>';
    return '<span class="md-tour__eyebrow">' + spark +
           '<span class="md-tour__eyebrow-text">' + eyebrow + '</span></span>' +
           '<span class="md-tour__heading">' + heading + '</span>';
  },

  // Page 1 ("Choose your display style"): the 3 layout style cards only. Rendered
  // as an HTML string into the Shepherd step text (Shepherd renders `text` via
  // innerHTML). Static i18n.t calls (NOT a loop with bound keys) so the
  // i18n_generator static parser can extract them. Selection is wired in
  // _onDisplayShow; data-gst-layout marks each option's value. The live preview +
  // content toggles + drag now live on page 2 (the home-layout step); page 1 pairs
  // these cards with a READ-ONLY preview (see _buildSteps).
  _styleCardsHtml: function() {
    // Pre-select the user's SAVED layout (default dynamic) so re-opening the
    // modal reflects what's stored, not a fixed default.
    var saved = this.get('appState.currentUser.preferences.dashboard_layout') || 'dynamic';
    if (['dynamic', 'balanced'].indexOf(saved) === -1) { saved = 'dynamic'; }
    var option = function(key, num, label, desc) {
      var sel = key === saved;
      return '<button type="button" class="md-gst-option' + (sel ? ' is-selected' : '') + '" data-gst-layout="' + key + '" aria-pressed="' + (sel ? 'true' : 'false') + '">' +
        '<span class="md-gst-option__num beta-welcome-steps__num">' + num + '</span>' +
        '<span class="md-gst-option__text">' +
          '<span class="md-gst-option__label">' + label + '</span>' +
          '<span class="md-gst-option__desc">' + desc + '</span>' +
        '</span>' +
      '</button>';
    };
    return '' +
      '<div class="md-gst-options">' +
        option('dynamic', '1', i18n.t('getting_started_tour_layout_dynamic', "Dynamic Layout"), i18n.t('getting_started_tour_layout_dynamic_desc', "Flexible multi-card organization")) +
        option('balanced', '2', i18n.t('getting_started_tour_layout_balanced', "Balanced Layout"), i18n.t('getting_started_tour_layout_balanced_desc', "Blend of structure and focus")) +
      '</div>';
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
  // Preview legend tag, labeled with the user's selected layout so the preview
  // reads as "this is the [Dynamic/Balanced] layout you picked". Three
  // static i18n.t calls (generator-friendly); _onDisplayShow updates the tag live
  // when the layout selection changes.
  _previewLabel: function(layout) {
    if (layout === 'balanced') { return i18n.t('getting_started_tour_preview_label_balanced', "Preview — Balanced Layout"); }
    return i18n.t('getting_started_tour_preview_label', "Preview — Dynamic Layout");
  },

  // Live, scaled-down copy of THIS user's real home dashboard — _onDisplayShow
  // clones the actual `.md-grid--dashboard` into `.md-gst-preview__live` so the
  // user sees their exact home page. Parameterized so the same builder serves both
  // modal pages:
  //   { toggles: true }  → page 2 (home layout): content checkboxes + drag-to-swap
  //   { toggles: false } → page 1 (display style): read-only preview, no controls
  // `opts.drag` (default true) is ANDed with the feature flag; pass false to force
  // a static preview. Section keys are fixed identifiers, so the JSON is safe in a
  // single-quoted attribute.
  _dynamicPreviewHtml: function(opts) {
    opts = opts || {};
    var withToggles = opts.toggles !== false;
    var dragOn = (opts.drag !== false) && !!this.get('appState.feature_flags.dashboard_drag_layout');
    var savedLayout = this.get('appState.currentUser.preferences.dashboard_layout') || 'dynamic';
    var saved = this.get('appState.currentUser.preferences.dashboard_positions');
    var savedJson = JSON.stringify((saved && typeof saved === 'object') ? saved : {});
    var savedBoards = this.get('appState.currentUser.preferences.dashboard_boards');
    var savedBoardsJson = JSON.stringify((savedBoards && typeof savedBoards === 'object') ? savedBoards : {});
    // Combined legend: the bracketed preview tag and (when dragging is enabled) the
    // swap instruction read as one modern, professional line directly above the live
    // preview — instead of two competing labels above and below the controls.
    var legend = '' +
      '<div class="md-gst-preview__legend">' +
        '<span class="md-gst-preview__legend-tag">' + this._previewLabel(savedLayout) + '</span>' +
        (dragOn ?
          '<span class="md-gst-preview__legend-dot" aria-hidden="true"></span>' +
          '<span class="md-gst-preview__legend-hint">' + i18n.t('getting_started_tour_drag_hint', "Drag a card onto another to swap their positions") + '</span>'
          : '') +
      '</div>';
    return '' +
      '<div class="md-gst-preview' + (withToggles ? ' md-gst-preview--with-toggles' : '') + '">' +
        (withToggles ? this._sectionTogglesHtml() : '') +
        legend +
        '<div class="md-gst-preview__live" data-gst-drag="' + (dragOn ? '1' : '') + '" data-gst-positions=\'' + savedJson + '\' data-gst-boards=\'' + savedBoardsJson + '\'>' +
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
    // Display the checklist alphabetically by (localized) label. `.slice()` so we
    // never reorder the array availableHomeSections returns — this is purely the
    // checklist's presentation order; the real dashboard order is unaffected.
    var sections = availableHomeSections(user).slice().sort(function(a, b) {
      return sectionLabel(a).localeCompare(sectionLabel(b));
    });
    var items = sections.map(function(s) {
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
        // Roomier welcome page: a short lead, a 1→2 progress stepper, and two
        // mini-mockup cards previewing the next two steps (see _welcomeContentHtml).
        text: this._welcomeContentHtml(),
        // md-gst-modal scopes the size/position overrides to THIS modal so the
        // home-tour welcome/outro keep the shared intro default; --welcome doubles
        // its size for the stepper + preview cards.
        classes: 'md-tour__step md-tour__step--intro md-gst-modal md-gst-modal--welcome',
        when: {
          // Step-level show OVERRIDES the default (_onShow from defaultStepOptions),
          // so _onWelcomeShow re-runs the shared centered-step setup AND wires the
          // showcase cards to advance the flow on click.
          show: function() { _onWelcomeShow.call(this); }
        },
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
      // Step 2 — "Choose your display style": the 3 layout style cards plus a
      // READ-ONLY preview of the selected style (no content toggles, no drag). The
      // user only picks a style here; configuring what appears + arranging it happens
      // on the next page. The same _onDisplayShow hook wires both pages — on this one
      // there are no toggles and drag is off, so it only wires the style cards + gate.
      {
        id: 'getting_started_tour_display',
        title: this._decoratedTitle('getting_started_tour_display_title', "Choose your display style"),
        text: this._styleCardsHtml() + this._dynamicPreviewHtml({ toggles: false, drag: false }) + this._orientationOverlayHtml(),
        when: {
          show: function() { _onDisplayShow.call(this, component); },
          // Persist whenever this step is HIDDEN — Next, Back, OR closing the modal
          // (X / Esc / "Maybe later"). Shepherd fires `hide` while the step's DOM is
          // still present, so the selection is readable. Scoped to THIS step's element
          // (`this.el`) so the two display pages never read each other's controls.
          hide: function() { try { component._persistDisplaySelection(this.el); } catch (e) { /* never block close */ } }
        },
        classes: 'md-tour__step md-tour__step--intro md-gst-modal md-gst-modal--display',
        buttons: [
          {
            text: i18n.t('getting_started_tour_back', "Back"),
            type: 'back',
            classes: 'md-tour__btn md-tour__btn--ghost'
          },
          {
            text: i18n.t('getting_started_tour_select', "Select"),
            // Advance to the home-layout page; the `hide` hook above saves the chosen
            // style. (Gate: the show hook keeps it disabled until a style is picked.)
            type: 'next',
            classes: 'md-tour__btn md-tour__btn--primary'
          }
        ]
      },
      // Step 3 — "Choose your home page layout": NO style cards. Shows the live
      // preview of the style picked on page 2's predecessor, the "Choose what appears
      // on your home page" toggles, and drag-to-swap. The same _onDisplayShow hook
      // wires it — here there are no style cards, so it wires the toggles + drag + gate.
      {
        id: 'getting_started_tour_layout',
        title: this._decoratedTitle('getting_started_tour_layout_title', "Customize your home page"),
        text: this._dynamicPreviewHtml({ toggles: true }) + this._orientationOverlayHtml(),
        when: {
          show: function() { _onDisplayShow.call(this, component); },
          hide: function() { try { component._persistDisplaySelection(this.el); } catch (e) { /* never block close */ } }
        },
        classes: 'md-tour__step md-tour__step--intro md-gst-modal md-gst-modal--display',
        buttons: [
          {
            text: i18n.t('getting_started_tour_back', "Back"),
            type: 'back',
            classes: 'md-tour__btn md-tour__btn--ghost'
          },
          {
            text: i18n.t('getting_started_tour_done', "Done"),
            // Last step — completes the tour; the `hide` hook saves this page.
            type: 'next',
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
