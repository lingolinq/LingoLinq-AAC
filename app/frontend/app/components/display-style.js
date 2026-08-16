import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { observer } from '@ember/object';
import i18n from '../utils/i18n';
import { availableHomeSections, sectionHidden, sectionLabel, sectionsMapFor, HOME_SECTIONS, EXTRA_HOME_TOGGLES, gridLayoutState, reorderInsert, reorderForFocused, defaultOrderFor, focusedHeroKey } from '../utils/dashboard_sections';

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
  // The Getting Started series cleared the page chrome via `md-ds-active` —
  // restore it when the series ends (Finish / Skip / Esc / close).
  try { document.body.classList.remove('md-ds-active'); } catch (e) { /* noop */ }
}

// Show hook for the welcome (first) page: just the shared centered-step setup.
// The welcome cards are now non-actionable labels, so the footer "Get started"
// is the only way forward. `this` is the active Shepherd Step.
function _onWelcomeShow() {
  try { _onShow.call(this); } catch (e) { /* shared setup is decorative */ }
}

// Reorder model: the layout is a single ORDERED LIST of section keys (see
// dashboard_sections.reorderInsert). Dragging a card INSERTS it before/after the
// card it's dropped on; Boards reorders like any other block. `_dropAfter` decides
// the insert side from the pointer position over the target: below the target's
// vertical midpoint → after; within its row → break the tie by the horizontal half.
function _dropAfter(targetCard, x, y) {
  var r = targetCard.getBoundingClientRect();
  var dy = y - (r.top + r.height / 2);
  if (dy < -2) { return false; }
  if (dy > 2) { return true; }
  return x > r.left + r.width / 2;
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
  var onChange = ctx.onChange;
  // The preview is rendered at a CSS zoom; a CSS translate on a card inside it
  // renders at translate × zoom on screen. Divide the screen-space cursor delta by
  // the zoom so the dragged ghost tracks the pointer 1:1 (defaults to 1 / no zoom).
  var scale = ctx.scale || 1;
  var cards = [];
  var state = null;
  // R2 affordance: when the user hovers a drop the ACTIVE layout forbids (a Focused-View
  // action button dragged out onto a full-width row), don't stay silent. Flip the dragged
  // ghost to a "not allowed" cue (cursor + warning outline) and briefly swap the legend
  // hint to say what IS allowed, then restore it. `hintEl` is the existing reorder-
  // instruction line above the preview; remember its default text to put back.
  var hintEl = ctx.hintEl || null;
  var defaultHint = hintEl ? hintEl.textContent : '';
  var setBlocked = function(card, blocked) {
    if (card) { card.classList.toggle('md-ds-drag-blocked', blocked); }
    if (hintEl) {
      // NOTE (security review false-positive — "locale string XSS in hint"): this writes
      // via `textContent`, which NEVER parses HTML, so a compromised/translated locale
      // string is rendered inert (no markup, no script). The string is also intentional
      // user-facing guidance, not internal/sensitive info ("hint exposes logic" FP).
      hintEl.textContent = blocked
        ? i18n.t('display_style_drag_blocked_row', "Action buttons can only be reordered within their own row. To move the actions row, drag one of the other buttons over it instead")
        : defaultHint;
      hintEl.classList.toggle('md-ds-preview__legend-hint--blocked', blocked);
    }
  };
  // The drag "lift" shadow, set inline on the dragged card (overriding its pinned resting
  // box-shadow) on grab instead of a CSS `filter: drop-shadow` — the filter forced a
  // render pass that re-rasterized the large gradient card as it moved. A box-shadow on
  // the will-change:transform layer is painted once and just composited, so the drag stays
  // smooth. Restored to the resting shadow on drop.
  var LIFT_SHADOW = '0 18px 34px rgba(20, 30, 50, 0.30)';
  // Whether dropping src onto dst is allowed under the ACTIVE layout. Gentle View
  // allows any insert (free reorder); Focused View defers to reorderForFocused
  // (utility cards reorder within their row; a utility card can't leave its row).
  var acceptsDrop = function(srcKey, dstKey) {
    if (!srcKey || !dstKey || srcKey === dstKey) { return false; }
    var layout = ctx.getLayout ? ctx.getLayout() : 'gentle';
    if (layout !== 'focused') { return true; }
    var def = ctx.getDefaultOrder ? ctx.getDefaultOrder() : null;
    return reorderForFocused(ctx.getOrder(), srcKey, dstKey, true, def) !== null;
  };
  // Resolve the (key, card) under a viewport point by GEOMETRY — test the cursor against
  // each card's screen rect, SKIPPING the dragged card. Deterministic: a CSS transform on
  // the dragged card is visual-only and never reflows its siblings, so every other card's
  // getBoundingClientRect() is its true on-screen cell, and the grid tiles them without
  // overlap (the cursor sits inside at most one non-dragged card; a grid gap → null).
  //
  // This replaced an elementsFromPoint walk: the clone forces pointer-events:none on
  // everything but the overlays, so elementsFromPoint could only see overlays and had to
  // peer THROUGH the z-index:999 ghost sitting under the cursor to reach the target's
  // overlay — an occluded lookup that intermittently returned no target (the drag's
  // "doesn't work every time" root cause). Rect-containment can't be fooled by stacking,
  // pointer-events, or the ghost. (Valid under the preview's CSS zoom: getBoundingClientRect
  // and clientX/Y share the same screen space.)
  // NOTE (security review false-positives — "IDOR via data-gst-key" + "missing null
  // check"): `data-gst-key` holds a fixed dashboard-SECTION name (boards/speak/reports/…
  // from HOME_SECTIONS), NOT a board id, and a reorder only writes the user's OWN
  // `preferences.dashboard_order` — no cross-user object or authorization surface. The
  // null-check concern is also moot: `getAttribute` returns null (never throws), every
  // card in `cards` had the attribute set before being pushed, and a null key is safely
  // rejected downstream by `acceptsDrop`.
  var keyAt = function(x, y, excludeCard) {
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (card === excludeCard) { continue; }
      var r = card.getBoundingClientRect();
      // Hidden cards (display:none via setCardDisplay) report a zero rect — skip them.
      if (r.width === 0 && r.height === 0) { continue; }
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        return { key: card.getAttribute('data-gst-key'), card: card };
      }
    }
    return null;
  };
  var clearTargets = function() {
    cards.forEach(function(c) { c.classList.remove('md-ds-drop-target'); });
  };
  // Highlight every card that would be displaced by this drop (by key).
  var highlight = function(keys) {
    cards.forEach(function(c) {
      if (keys.indexOf(c.getAttribute('data-gst-key')) !== -1) { c.classList.add('md-ds-drop-target'); }
    });
  };
  // One rAF per frame coalesces the (many) pointermove events: we move the ghost with a
  // GPU translate3d and run the (now cheap) geometry hit-test every frame, but only touch
  // the DOM (recompute the displaced-target highlight) when the hovered target actually
  // CHANGES — so dragging stays smooth instead of thrashing layout on every event.
  var raf = (typeof window !== 'undefined' && window.requestAnimationFrame) ? window.requestAnimationFrame.bind(window) : function(cb) { return setTimeout(cb, 16); };
  var caf = (typeof window !== 'undefined' && window.cancelAnimationFrame) ? window.cancelAnimationFrame.bind(window) : clearTimeout;
  var scheduleFrame = function() {
    if (!state || state.frame) { return; }
    state.frame = raf(function() {
      if (!state) { return; }
      state.frame = 0;
      state.card.style.setProperty('transform', 'translate3d(' + ((state.x - state.startX) / scale) + 'px,' + ((state.y - state.startY) / scale) + 'px,0)', 'important');
      var hit = keyAt(state.x, state.y, state.card);
      var over = (hit && hit.key !== state.key) ? hit.key : null;
      var hitKey = (over && acceptsDrop(state.key, over)) ? over : null;
      // Hovering a real card the drop FORBIDS (Focused: an action button over a
      // full-width row) → show the not-allowed cue instead of dead silence.
      var blocked = !!(over && !hitKey);
      if (hitKey !== state.lastHit || blocked !== state.lastBlocked) {
        state.lastHit = hitKey;
        state.lastBlocked = blocked;
        clearTargets();
        setBlocked(state.card, blocked);
        // Only highlight a target the drop would actually accept, so a disallowed
        // drop gives no false "this will move here" affordance.
        if (hitKey) { highlight([hitKey]); }
      }
    });
  };
  // Apply a completed drop: INSERT the dragged card before/after the target in the
  // saved order (Boards included — it reorders like any block). `after` comes from
  // the pointer position over the target (_dropAfter).
  var commitDrop = function(srcKey, dstKey, after) {
    if (srcKey === dstKey) { return; }
    // Seed an as-yet-uncustomized order from the ACTIVE layout's default (Focused
    // View has its own), so dragging a card doesn't reflow the untouched cards to
    // the other layout's default arrangement.
    var def = ctx.getDefaultOrder ? ctx.getDefaultOrder() : null;
    var layout = ctx.getLayout ? ctx.getLayout() : 'gentle';
    // Focused View constrains the drop (utility cards reorder within their row;
    // whole rows reposition between rows); Gentle View is a free insert.
    var next = (layout === 'focused')
      ? reorderForFocused(ctx.getOrder(), srcKey, dstKey, after, def)
      : reorderInsert(ctx.getOrder(), srcKey, dstKey, after, def);
    if (!next) { return; } // disallowed drop — leave the order untouched
    ctx.setOrder(next);
    onChange();
  };
  HOME_SECTIONS.forEach(function(s) {
    Array.prototype.forEach.call(liveEl.querySelectorAll('.' + s.cardClass), function(card) {
      if (card._gstDragWired) { return; }
      card._gstDragWired = true;
      card.classList.add('md-ds-draggable');
      card.setAttribute('data-gst-key', s.key);
      // Kill the card's hover lift/glow in the preview. The drag overlay below is a
      // DESCENDANT, so hovering it still marks the card :hover (CSS :hover matches the
      // hovered node AND its ancestors) — and the lift rules out-specify any class
      // override (up to 0,5,0). Pinning transform + the resting box-shadow inline with
      // !important beats every stylesheet hover rule regardless of specificity, so the
      // card stays visually static. Resting box-shadow is read now (pre-hover).
      card.style.setProperty('transform', 'none', 'important');
      var restShadow = (typeof window !== 'undefined' && window.getComputedStyle) ? window.getComputedStyle(card).boxShadow : '';
      card._gstRestShadow = (restShadow && restShadow !== 'none') ? restShadow : '';
      if (card._gstRestShadow) { card.style.setProperty('box-shadow', card._gstRestShadow, 'important'); }
      var ov = document.createElement('div');
      ov.className = 'md-ds-drag-overlay';
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
        // Ghost: lift the card out (dimmed via .md-ds-dragging) and let it follow
        // the cursor by translating it — z-index above its siblings.
        state = { key: s.key, card: card, ov: ov, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, lastHit: null, lastBlocked: false, frame: 0 };
        card.classList.add('md-ds-dragging');
        // NOTE (security review false-positive — "CSP nonce for inline box-shadow"): CSSOM
        // writes via element.style.setProperty are NOT governed by CSP style-src (that
        // covers <style> blocks + HTML style="" attributes), so no nonce is needed and CSP
        // can't break this. The transform/z-index lines already use the same mechanism.
        card.style.setProperty('box-shadow', LIFT_SHADOW, 'important');
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
        // Re-derive the drop target by GEOMETRY at the ACTUAL release point (see keyAt),
        // NOT a cached lastHit. lastHit can be a stale frame — the final pointermove's
        // frame is cancelled just above, so a fast release would otherwise commit to the
        // slot the cursor had already left. Hit-testing the release coords is
        // deterministic (rect containment, ghost excluded), which removes that race and
        // the old elementsFromPoint misses in one step.
        var h = keyAt(e.clientX, e.clientY, src.card);
        var hitKey = (h && h.key !== src.key && acceptsDrop(src.key, h.key)) ? h.key : null;
        var hitCard = hitKey ? h.card : null;
        // Drop the ghost back into the grid (transform pinned to none keeps hover
        // suppressed); a re-render after commit snaps it to its new cell.
        src.card.classList.remove('md-ds-dragging');
        src.card.style.setProperty('transform', 'none', 'important');
        src.card.style.removeProperty('z-index');
        // Restore the resting (pinned) shadow — the lift box-shadow was inline-set on grab.
        if (src.card._gstRestShadow) { src.card.style.setProperty('box-shadow', src.card._gstRestShadow, 'important'); }
        else { src.card.style.removeProperty('box-shadow'); }
        clearTargets();
        setBlocked(src.card, false); // clear the not-allowed cue + restore the hint text
        // NOTE (security review — LOW, non-issue: "capture release may fail"): the browser
        // auto-releases pointer capture on pointerup/pointercancel (this very handler), so
        // explicit release is belt-and-suspenders; swallowing its throw (already-released)
        // can't leak capture — the implicit release has already happened.
        try { src.ov.releasePointerCapture(e.pointerId); } catch (e2) { /* noop */ }
        if (hitKey && hitCard) {
          commitDrop(src.key, hitKey, _dropAfter(hitCard, e.clientX, e.clientY));
        }
      };
      ov.addEventListener('pointerup', finish);
      ov.addEventListener('pointercancel', finish);
    });
  });
}

// ── Layout-aware preview content ────────────────────────────────────────────
// The read-only preview shows what the SELECTED layout looks like by cloning the
// user's real dashboard grid into a single `.md-ds-preview__page`, swapped
// wholesale when the layout changes (Gentle View vs Focused View).
// Scale the preview so the WHOLE cloned page fits the room the modal has left,
// so the Customize step never needs vertical scrolling to reach a card (you can't
// easily drag a card you have to scroll to). The stylesheet's 0.8 becomes a CAP
// rather than a fixed value: roomy screens keep the existing look, and a TALL
// dashboard — a supervisor with Caseload + Attention + Rooms + Organizations on
// top of the usual cards — scales down further instead of overflowing.
// Everything below the frame is MEASURED, not hardcoded, so a future change to the
// footer or header can't silently reintroduce a scrollbar.
function _fitPreviewZoom(live) {
  if (!live) { return; }
  var page = live.querySelector('.md-ds-preview__page');
  if (!page) { return; }
  var MAX_ZOOM = 0.8;   // the stylesheet default — never scale UP past it
  var MIN_ZOOM = 0.28;  // below this the cards stop being recognisable/draggable
  try {
    // Measure unscaled: with zoom neutralised, `natural` is the true content
    // height. Same tick as the write below, so no intermediate paint.
    live.style.setProperty('--md-ds-preview-zoom', '1');
    var natural = page.getBoundingClientRect().height;
    if (!natural) { live.style.removeProperty('--md-ds-preview-zoom'); return; }
    var cs = window.getComputedStyle(live);
    var padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    var content = live.closest('.shepherd-content');
    var footer = content && content.querySelector('.shepherd-footer');
    // + its margin-top/padding-top/border (16 + 16) from the footer rule.
    var footerH = footer ? footer.getBoundingClientRect().height + 32 : 0;
    // The frame's own top is set by the content above it and does not depend on
    // the page's zoom, so it is safe to read while zoom is neutralised.
    var top = live.getBoundingClientRect().top;
    var avail = window.innerHeight - top - padY - footerH - 12;
    var zoom = Math.min(MAX_ZOOM, avail / natural);
    if (!isFinite(zoom) || zoom <= 0) { zoom = MAX_ZOOM; }
    live.style.setProperty('--md-ds-preview-zoom', String(Math.max(MIN_ZOOM, zoom)));
  } catch (e) {
    // Any measurement failure falls back to the stylesheet default.
    live.style.removeProperty('--md-ds-preview-zoom');
  }
}

function _buildGentleViewClone(live) {
  var src = document.querySelector('.md-grid--dashboard:not(.md-ds-preview__clone)');
  if (!src) { return; }
  var page = document.createElement('div');
  page.className = 'md-ds-preview__page';
  page.setAttribute('aria-hidden', 'true');
  // The welcome hero banner is a sibling ABOVE the grid (in .md-main), so clone it
  // into the page too — otherwise the hero toggle saves + reflows the real page but
  // never shows in the preview. Its show/hide is then driven by syncState's
  // EXTRA_HOME_TOGGLES loop (setCardDisplay on .md-hero--dashboard), which also
  // forces it off under Focused View — exactly like the real page.
  var heroSrc = document.querySelector('.md-hero--dashboard');
  if (heroSrc) {
    var heroClone = heroSrc.cloneNode(true);
    heroClone.removeAttribute('id');
    Array.prototype.forEach.call(heroClone.querySelectorAll('[id]'), function(n) { n.removeAttribute('id'); });
    heroClone.classList.add('md-ds-preview__hero');
    page.appendChild(heroClone);
  }
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
  clone.classList.add('md-ds-preview__clone');
  page.appendChild(clone);
  live.appendChild(page);
}

// ── Per-style page previews (the `→ preview` beside each style card) ─────────
// Each style card gets its OWN preview of the page the user is currently on,
// rendered in that style. Unlike the dashboard preview above, this cannot be done
// by cloning into the current document: Focused View's rules live in
// styles/_focused-view.scss scoped under `body.ll-layout-focused`, so two clones
// inside the same <body> inherit the same state and render IDENTICALLY. Each
// preview therefore gets its own <iframe> — its own document, its own <body>, its
// own class — which is what makes the two genuinely differ.
//
// This also keeps _focused-view.scss completely untouched. The alternative (adding
// a `.ll-scope--focused` container scope to that file) would break exactly where it
// matters most: ~24 of its rules key off document-level ancestors such as
// `#within_ember #content.modern-dashboard:has(.md-shell--caseload)`, which cannot
// resolve inside a container, and those are the rules that restyle the caseload page.
var PREVIEW_SHELL_SELECTOR = '.md-shell:not(.md-ds-preview__clone)';

// The page's own root, e.g. `.md-shell--caseload` or `.md-shell--dashboard`.
// Excludes anything inside the modal so re-opening never previews a previous preview.
function _livePageShell() {
  var shells = document.querySelectorAll(PREVIEW_SHELL_SELECTOR);
  for (var i = 0; i < shells.length; i++) {
    if (!shells[i].closest('.shepherd-element')) { return shells[i]; }
  }
  return null;
}

// Rebuild the shell's ANCESTOR CHAIN (shallow clones, ids/classes preserved) with the
// deep-cloned shell at the bottom. The chain matters: _focused-view.scss reaches for
// `#within_ember`, `#content.modern-dashboard`, and `:has()` relationships between
// them, so a bare shell in a bare body would miss the very rules being previewed.
// Shallow-cloning the ancestors keeps that context without dragging in their other
// children (open modals, the header, the tour overlay itself).
// Re-point the clone's ELEMENT-level layout classes at the style being previewed.
//
// Necessary because the body class is not the whole story. `_focused-view.scss` is
// body-scoped (which the iframe handles), but the dashboard ALSO varies by element
// classes bound to the saved preference: `md-shell--layout-focused` on the shell
// (authenticated-view.hbs:1) and `md-grid--layout-gentle|focused` on the grid
// (authenticated-view.js#dashboardLayoutClass). A clone inherits whichever is
// currently saved, so without this both dashboard previews rendered the SAME layout —
// caseload happened to work only because its differences are purely body-scoped.
function _applyLayoutClasses(root, layout) {
  var focused = layout === 'focused';
  Array.prototype.forEach.call(root.querySelectorAll('[class*="--layout-"]'), function(n) {
    n.classList.forEach(function(c) {
      var m = /^(.*)--layout-(gentle|focused)$/.exec(c);
      if (m) {
        n.classList.remove(c);
        n.classList.add(m[1] + '--layout-' + (focused ? 'focused' : 'gentle'));
      }
    });
  });
  // The shell's focused modifier has no gentle counterpart — the template only ADDS it
  // when focused — so a swap alone can never introduce it. Toggle it explicitly.
  var shellEl = root.matches && root.matches('.md-shell') ? root : root.querySelector('.md-shell');
  if (shellEl) { shellEl.classList.toggle('md-shell--layout-focused', focused); }
}

// How many communicator rows the caseload preview keeps. The roster is the one part of
// the page that grows without bound, and its height is what forces the preview to be
// scaled down — a 15-person caseload made it so tall that fitting it left a narrow strip.
// Three rows show what the list looks like in each style while keeping the preview large.
var PREVIEW_MAX_ROSTER_ROWS = 3;

function _previewChainHtml(shell, layout) {
  var deep = shell.cloneNode(true);
  _applyLayoutClasses(deep, layout);
  // Trim the roster. Done on the CLONE only — the live page is untouched.
  Array.prototype.forEach.call(deep.querySelectorAll('.md-caseload__list'), function(list) {
    var rows = list.querySelectorAll(':scope > .md-caseload__list-row');
    for (var i = PREVIEW_MAX_ROSTER_ROWS; i < rows.length; i++) {
      if (rows[i].parentNode) { rows[i].parentNode.removeChild(rows[i]); }
    }
  });
  // Inert: the preview is decorative, and a stray focus/click inside an iframe must
  // never navigate or steal the tab order from the modal.
  Array.prototype.forEach.call(deep.querySelectorAll('a[href]'), function(n) { n.removeAttribute('href'); });
  Array.prototype.forEach.call(deep.querySelectorAll('a, button, input, select, textarea, [tabindex]'), function(n) {
    n.setAttribute('tabindex', '-1');
  });
  var node = deep;
  var parent = shell.parentElement;
  while (parent && parent.tagName && parent.tagName.toLowerCase() !== 'body') {
    var wrapper = parent.cloneNode(false);
    wrapper.appendChild(node);
    node = wrapper;
    parent = parent.parentElement;
  }
  var holder = document.createElement('div');
  holder.appendChild(node);
  return holder.innerHTML;
}

// Every stylesheet the real page is using, so the iframe renders with the same CSS.
// Same URLs as the parent document, so the browser serves them from cache rather than
// refetching — the cost is a second parse, not a second download.
function _previewHeadHtml() {
  var out = '';
  Array.prototype.forEach.call(document.querySelectorAll('link[rel="stylesheet"]'), function(l) {
    if (l.href) { out += '<link rel="stylesheet" href="' + l.href.replace(/"/g, '&quot;') + '">'; }
  });
  Array.prototype.forEach.call(document.querySelectorAll('style'), function(s) {
    out += '<style>' + s.innerHTML + '</style>';
  });
  // The preview is a static picture of a page: never let it scroll or show a bar.
  //
  // `#content` is the app's INTERNAL scroller — it is viewport-height with its own
  // overflow, so the document never grows and everything below the fold is clipped
  // (measured: 2071px of dashboard content inside a 950px box). Letting it expand here
  // is what makes the preview show every item on the page rather than the first screen.
  // Scoped to this iframe's document, so the real page is untouched.
  // NOTE: no `overflow:hidden` on html/body. It suppressed nothing useful (the iframe
  // carries scrolling="no", and .md-ds-stylepreview__viewport clips) but it DID cap
  // documentElement.scrollHeight at the frame height, so the page-height measurement in
  // _fitStylePreviews always read one viewport and the preview stayed cropped.
  // `html body #…` rather than a bare `#content`: the app pins these to the viewport with
  // its own !important rules at higher specificity, so a plain `#content{...!important}`
  // lost and the preview stayed clipped at one screenful (measured: `#content` kept
  // css-height 950px with 2071px of content inside it). !important alone is not enough
  // when the loser is also !important — specificity still decides.
  out += '<style>html,body{margin:0 !important;background:transparent !important;}' +
         'html body #within_ember,html body #within_ember #content,html body #within_ember #content.index' +
         '{height:auto !important;max-height:none !important;min-height:0 !important;overflow:visible !important;}' +
         // NOT `animation: none`. Several elements are laid out at `opacity: 0` and made
         // visible by an entrance animation with `forwards` fill — the caseload hero's
         // title and subheader are exactly this (`.md-hero__title--from-left` /
         // `.md-hero__sub--from-right`, app.scss:32691). Killing the animation outright
         // stranded them at opacity 0, so the preview lost its header and subheader.
         // Collapsing duration + delay to zero instead lets each animation complete
         // instantly and apply its END state, which removes the motion but keeps the
         // result.
         '*{animation-duration:0s !important;animation-delay:0s !important;' +
         'transition:none !important;scroll-behavior:auto !important;}</style>';
  return out;
}

// Render one style preview. `layout` is 'gentle' or 'focused' — the ONLY difference
// between the two documents is whether <body> carries `ll-layout-focused`, which is
// exactly the switch the real app flips (app-state `sync_layout_scope`).
function _writeStylePreview(frame, shell, layout) {
  var doc = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);
  if (!doc) { return; }
  // Start from the REAL body/html classes so theme, speak-mode etc. carry over, then
  // set the one class under test. Copying rather than hardcoding means a future
  // body-level class can't silently drop out of the preview.
  //
  // But the MODAL'S OWN state classes must be stripped first. `md-ds-active` is added
  // by _startDisplayStyle to strip the live page back to brand + avatar while the
  // series runs, and it does that with `body.md-ds-active .md-workspace {visibility:
  // hidden}` — copying it into the preview blanked every preview to a bare gradient.
  // The shepherd-*/md-tour-- classes are transient modal state for the same reason.
  // Only page-level styling state should reach the preview.
  var bodyClass = (document.body.className || '')
    .split(/\s+/)
    .filter(function(c) {
      return c && c !== 'md-ds-active' && c.indexOf('shepherd-') !== 0 && c.indexOf('md-tour-') !== 0;
    })
    .filter(function(c) { return c !== 'll-layout-focused'; })
    .join(' ');
  if (layout === 'focused') { bodyClass = (bodyClass + ' ll-layout-focused').trim(); }
  var htmlClass = (document.documentElement.className || '').replace(/"/g, '&quot;');
  doc.open();
  doc.write('<!doctype html><html class="' + htmlClass + '"><head><base href="' + document.baseURI.replace(/"/g, '&quot;') + '">' +
    _previewHeadHtml() + '</head><body class="' + bodyClass.replace(/"/g, '&quot;') + '">' +
    _previewChainHtml(shell, layout) + '</body></html>');
  doc.close();
}

// Size each frame to the real viewport, then scale it to its slot. Rendering at true
// viewport width (rather than a narrow frame) is what makes the preview representative:
// the app's layout is full of width breakpoints, and a 300px-wide iframe would render
// the MOBILE layout and preview the wrong thing entirely.
//
// Fit the WHOLE page into the slot — nothing cropped, so the preview accurately shows
// every item on the page. This is only affordable because the modal is now full-bleed
// (100vw × 100vh): an earlier 80vw modal left so little vertical room that fitting
// entirely rendered the page at ~0.27 with a third of the slot blank, which is why this
// used to scale-to-width and crop the bottom instead.
//
// The BOX is then sized to the scaled page rather than the page being letterboxed inside
// a fixed box. Fitting both axes always leaves slack on one of them (the row is much
// wider than the page's ~1.5:1 once two rows share the height), and as a bordered white
// panel that slack read as large dead margins beside the page. Shrinking the box to
// `page × scale` removes it entirely, and the box centres itself in the row.
//
// No measurement feedback loop: available WIDTH is read from the parent figure (which
// this function never writes to) and available HEIGHT from the box's flex-allocated
// height, which setting `width` does not disturb.
// Fits ALL of the step's previews together, at a SHARED scale. Sharing matters: Gentle
// and Focused produce different content heights (measured 2071px vs 1822px on the
// dashboard), and scaling each to its own height would render them at different zooms —
// making the two pictures incomparable, which defeats the point of showing them side by
// side. One scale means the shorter layout simply ends higher, which is itself the
// difference being communicated.
// Measure a preview document's INK BOX — the top and bottom of its actual content.
//
// Ancestor heights are useless here: the app pins `#within_ember` / `#content` to the
// viewport, so documentElement, body and the root child all report exactly one viewport
// while the real content (2071px on the dashboard) spills out visibly.
//
// Measured over LEAF elements only, which is what makes the box tight at BOTH ends:
//   • top — the page's containers start at y=0, but the first thing you can actually see
//     is lower down (the app header is not cloned, yet the layout still reserves its
//     space). Taking the topmost leaf crops that empty band off.
//   • bottom — `.md-shell` keeps running to full page height past the last visible row,
//     so measuring containers left a tall blank tail under a short layout.
function _measureInkBox(doc) {
  var top = Infinity;
  var bottom = 0;
  Array.prototype.forEach.call(doc.body.querySelectorAll('*'), function(n) {
    if (n.firstElementChild) { return; }           // containers are measured via their leaves
    var r = n.getBoundingClientRect();
    if (!r.height || !r.width) { return; }
    if (r.top < top) { top = r.top; }
    if (r.bottom > bottom) { bottom = r.bottom; }
  });
  if (!isFinite(top) || bottom <= top) { return null; }
  // Bleed so a card's border/shadow/padding just past its outermost leaf is not shaved.
  // The TOP bleed is deliberately generous: cropping tight to the first leaf put the pill
  // nav flush against the panel edge, which read as the page having been cut off rather
  // than framed. This keeps a band of the page's own background above it.
  top = Math.max(0, Math.floor(top) - 32);
  bottom = Math.ceil(bottom) + 16;
  return { top: top, bottom: bottom, height: bottom - top };
}

function _fitStylePreviews(el) {
  var wraps = Array.prototype.slice.call(el.querySelectorAll('.md-ds-stylepreview__viewport'));
  if (!wraps.length) { return; }
  // Rendered at the REAL viewport size so width breakpoints resolve the same way they do
  // on the live page — a narrow iframe would render the mobile layout instead.
  var vw = Math.max(window.innerWidth, 1024);
  var vh = Math.max(window.innerHeight, 700);

  // PASS 1 — give every frame room to lay out, then measure its ink box. The frame is
  // sized generously first so nothing is still clipped at measuring time, and each pass
  // re-measures from that same starting point so the value cannot ratchet upward.
  var boxes = [];
  wraps.forEach(function(wrap) {
    var frame = wrap.querySelector('.md-ds-stylepreview__frame');
    var box = null;
    if (frame) {
      frame.style.width = vw + 'px';
      frame.style.height = (vh * 4) + 'px';
      try {
        var doc = frame.contentDocument;
        if (doc && doc.body) { box = _measureInkBox(doc); }
      } catch (e) { /* unreadable document — fall back below */ }
    }
    if (!box) { box = { top: 0, bottom: vh, height: vh }; }
    boxes.push(box);
  });

  // ONE scale for both previews. Scaling each to its own content would render them at
  // different zooms and make the two pictures incomparable — which is the whole point of
  // showing them together. At a shared scale the shorter layout simply produces a shorter
  // box, which is itself the difference being shown.
  var availW = 0;
  wraps.forEach(function(wrap) {
    var fig = wrap.parentElement;
    if (!fig) { return; }
    // Measured off the FIGURE, never off `wrap` itself: pass 2 writes wrap's width and
    // height, so reading them back here would feed this calculation its own output.
    availW = Math.max(availW, fig.clientWidth);
  });
  if (!availW) { return; }
  // Scaled to fill the available WIDTH — the previews are meant to occupy the whole right
  // side of the modal. Height is deliberately NOT part of this: constraining to the row's
  // share of the viewport kept the panels well short of the right edge. Bounding the
  // roster to PREVIEW_MAX_ROSTER_ROWS is what keeps the resulting height sensible; if the
  // two rows do exceed the modal, it already scrolls (`overflow-y: auto`).
  // Never upscale past 1:1 — that would render a blurry, larger-than-life page.
  var scale = Math.min(1, availW / vw);
  if (!isFinite(scale) || scale <= 0) { scale = 0.3; }

  // PASS 2 — shift each frame up by its own ink-box top (cropping the reserved-header
  // band) and size its box to its own ink height (dropping the blank tail).
  wraps.forEach(function(wrap, i) {
    var frame = wrap.querySelector('.md-ds-stylepreview__frame');
    if (!frame) { return; }
    var box = boxes[i];
    frame.style.height = (box.bottom + 8) + 'px';
    frame.style.transform = 'scale(' + scale + ')';
    frame.style.left = '0px';
    frame.style.top = '-' + Math.round(box.top * scale) + 'px';
    var panelW = Math.round(vw * scale);
    wrap.style.width = panelW + 'px';
    wrap.style.height = Math.round(box.height * scale) + 'px';
    // Match the caption to the panel so `text-align: center` centres it under the PANEL
    // rather than under the wider figure (see the caption rule in app.scss).
    var cap = wrap.parentElement && wrap.parentElement.querySelector('.md-ds-stylepreview__caption');
    if (cap) { cap.style.width = panelW + 'px'; }
  });
}

// Build both style previews for the step, once. Returns silently when the page has no
// shell to preview — the preview is decorative and must never block choosing a style.
function _buildStylePreviews(el) {
  var shell = _livePageShell();
  if (!shell) { return; }
  Array.prototype.forEach.call(el.querySelectorAll('[data-gst-stylepreview]'), function(wrap) {
    var layout = wrap.getAttribute('data-gst-stylepreview');
    var viewport = wrap.querySelector('.md-ds-stylepreview__viewport');
    if (!viewport || viewport.querySelector('iframe')) { return; }
    var frame = document.createElement('iframe');
    frame.className = 'md-ds-stylepreview__frame';
    frame.setAttribute('aria-hidden', 'true');
    frame.setAttribute('tabindex', '-1');
    frame.setAttribute('scrolling', 'no');
    // Same-origin (no src) so we can write into it; `allow-same-origin` only, so the
    // cloned markup can never run script even if a stray inline handler survived.
    frame.setAttribute('sandbox', 'allow-same-origin');
    viewport.appendChild(frame);
    try {
      _writeStylePreview(frame, shell, layout);
    } catch (e) { /* decorative — a failed preview must not break the chooser */ }
  });
  // Fit AFTER every frame is written: the shared scale is derived from the tallest of
  // them, so it cannot be computed one preview at a time.
  try { _fitStylePreviews(el); } catch (e) { /* decorative */ }
}

// Swap the preview content. Removes the existing page first so switching styles
// (re-clicking a style card) re-renders cleanly.
function _buildPreviewContent(live) {
  if (!live) { return; }
  try {
    var existing = live.querySelector('.md-ds-preview__page');
    if (existing && existing.parentNode) { existing.parentNode.removeChild(existing); }
    _buildGentleViewClone(live);
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
    var live = el.querySelector('.md-ds-preview__live');
    if (live && !live.querySelector('.md-ds-preview__page')) {
      _buildPreviewContent(live);
    }
  } catch (e) { /* preview is decorative — never block the step */ }

  // Per-style page previews (the `→ preview` beside each card, display-style step
  // only). Built once on show; re-fitted on resize/rotate so a tablet turned
  // mid-modal re-scales instead of cropping. The listener is removed when the step's
  // element leaves the DOM — Shepherd destroys the step on BOTH Done and close
  // without a reliable hide hook (see the persist comment above), so an element-
  // connectivity check is the dependable teardown signal rather than a lifecycle event.
  try {
    if (el.querySelector('[data-gst-stylepreview]')) {
      _buildStylePreviews(el);
      var refit = function() {
        if (!el.isConnected) { window.removeEventListener('resize', refit); return; }
        _fitStylePreviews(el);
      };
      window.addEventListener('resize', refit);
      // The modal animates in, so the slot has no final size on the first frame.
      // Re-fit once it has settled, otherwise every preview scales against a 0-height
      // slot and falls back to the minimum. setTimeout (not runLater) to match this
      // file's existing debounce and avoid adding an `ember/no-runloop` error — the
      // suggested replacement, ember-lifeline, is not a dependency of this app.
      setTimeout(refit, 60);
      setTimeout(refit, 320);
    }
  } catch (e) { /* preview is decorative — never block the step */ }

  // Wire the section checkboxes + layout options. On any change we recompute the
  // whole preview (the layout depends on the COMBINATION of toggles) via the
  // shared gridLayoutState — the SAME source of truth as the dashboard render —
  // and refresh the gate: Next is enabled only when a layout AND at least one
  // display element are chosen; with zero elements we also show the empty-state
  // overlay over the preview.
  try {
    var liveEl = el.querySelector('.md-ds-preview__live');
    var gridEl = liveEl && liveEl.querySelector('.md-ds-preview__clone');
    // Label the preview legend with the layout the user has selected (mirrors
    // component._previewLabel; defined here because _onDisplayShow is a module
    // function with no component `this`). Updated on show (re-seed) and on each
    // style-card click so "Preview — X Layout" always names the current choice.
    var previewLabelFor = function(layout) {
      if (layout === 'focused') { return i18n.t('display_style_preview_label_focused', "Preview — Focused View"); }
      return i18n.t('display_style_preview_label', "Preview — Gentle View");
    };
    var setPreviewLabel = function(layout) {
      var tag = el.querySelector('.md-ds-preview__legend-tag');
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
      var _seedUser = _appState && (_appState.get('referenced_user') || _appState.get('currentUser'));
      if (_seedUser && liveEl) {
        var _savedLayout = _seedUser.get('preferences.dashboard_layout') || 'gentle';
        if (['gentle', 'focused'].indexOf(_savedLayout) === -1) { _savedLayout = 'gentle'; }
        Array.prototype.forEach.call(el.querySelectorAll('.md-ds-select'), function(opt) {
          var on = opt.getAttribute('data-gst-layout') === _savedLayout;
          opt.classList.toggle('is-selected', on);
          opt.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        setPreviewLabel(_savedLayout);
        Array.prototype.forEach.call(el.querySelectorAll('.md-ds-section__input'), function(box) {
          box.checked = !sectionHidden(_seedUser, box.getAttribute('data-gst-section'));
        });
        var _so = _seedUser.get('preferences.dashboard_order');
        liveEl.setAttribute('data-gst-order', JSON.stringify((_so && _so.length) ? _so : []));
      }
    } catch (e) { /* re-seed is best-effort — falls back to the stamped HTML */ }
    // Drag-to-reorder state (flagged): the saved order + whether the flag is on are
    // stamped onto the live element by _gentlePreviewHtml. We replace this `order`
    // array on each insert and stamp it back onto the live element so
    // _persistDisplaySelection can read the final arrangement to save.
    var order = [];
    var dragEnabled = false;
    if (liveEl) {
      try { order = JSON.parse(liveEl.getAttribute('data-gst-order') || '[]') || []; } catch (e) { order = []; }
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
        previewUser = _flagState.get('referenced_user') || _flagState.get('currentUser');
      }
    } catch (e) { flagOn = dragEnabled; }
    var boxes = el.querySelectorAll('.md-ds-section__input');
    var options = el.querySelectorAll('.md-ds-select');
    var nextBtn = el.querySelector('.shepherd-footer .md-tour__btn--primary');
    // The optional "Customize your dashboard" link on the display-style page. It
    // advances the same way the primary used to, so it has to obey the SAME gate —
    // otherwise it would be a way around a disabled Done. Absent on other pages.
    var linkBtn = el.querySelector('.shepherd-footer .md-tour__btn--link');
    var cancelBtn = el.querySelector('.shepherd-cancel-icon');
    var overlay = el.querySelector('.md-ds-empty');
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
        EXTRA_HOME_TOGGLES.forEach(function(t) {
          vis[t.key] = !sectionHidden(previewUser, t.key);
        });
        return vis;
      }
      Array.prototype.forEach.call(boxes, function(box) {
        vis[box.getAttribute('data-gst-section')] = box.checked;
      });
      return vis;
    };

    // Only toggles APPLICABLE to the active layout count toward "is anything
    // selected?". Focused View hides the Extras + Welcome-banner toggles
    // (applyLayoutSections sets their row to display:none) but leaves them CHECKED,
    // so counting every box would mask an otherwise-empty selection — wrongly
    // keeping Done/close enabled and the empty overlay hidden when the user has
    // unchecked all the VISIBLE elements.
    var applicableBoxes = function() {
      return Array.prototype.filter.call(boxes, function(b) {
        var row = b.closest('.md-ds-section');
        return row && row.style.display !== 'none';
      });
    };
    var anyChecked = function() {
      return applicableBoxes().some(function(b) { return b.checked; });
    };
    // Next requires a layout choice AND at least one display element; the empty
    // overlay appears whenever zero applicable elements are selected.
    // Gate adapts to whichever controls THIS page has: the display-style page has
    // style cards but no toggles (require a layout); the home-layout page has
    // toggles but no cards (require at least one section). A control type that's
    // absent on a page is treated as satisfied so it never blocks Next.
    var refreshGate = function() {
      var applicable = applicableBoxes();
      var hasSection = (applicable.length === 0) ? true : anyChecked();
      var hasLayout = (options.length === 0) ? true : !!el.querySelector('.md-ds-select.is-selected');
      var disabled = !(hasSection && hasLayout);
      if (nextBtn) {
        nextBtn.disabled = disabled;
        nextBtn.classList.toggle('md-tour__btn--disabled', disabled);
        nextBtn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
      }
      if (linkBtn) {
        linkBtn.disabled = disabled;
        linkBtn.classList.toggle('md-tour__btn--disabled', disabled);
        linkBtn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
      }
      // Gate the close (X) the same way — the user must keep at least one element
      // for the chosen layout, so they can't dismiss the modal with an empty
      // dashboard. (Back is still available to return to the display-style page.)
      if (cancelBtn) {
        cancelBtn.disabled = disabled;
        cancelBtn.classList.toggle('md-ds-cancel--blocked', disabled);
        cancelBtn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
      }
      // The empty-state overlay only applies where the toggles live (customize page).
      if (overlay) { overlay.classList.toggle('is-visible', applicable.length > 0 && !hasSection); }
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
      var sel = el.querySelector('.md-ds-select.is-selected');
      if (sel) { return sel.getAttribute('data-gst-layout') || 'gentle'; }
      try {
        var as = (typeof window !== 'undefined' && window.LingoLinq) ? window.LingoLinq.appState : null;
        // Resolve through the same dashboard user the rest of this component uses
        // (referenced_user || currentUser) so this fallback can't diverge from the seam.
        var u = as && (as.get('referenced_user') || as.get('currentUser'));
        return (u && u.get('preferences.dashboard_layout')) || 'gentle';
      } catch (e) { return 'gentle'; }
    };
    var applyLayoutSections = function(layout) {
      var focused = (layout === 'focused');
      Array.prototype.forEach.call(boxes, function(box) {
        var key = box.getAttribute('data-gst-section');
        var row = box.closest('.md-ds-section');
        if (!row) { return; }
        // Focused View offers everything EXCEPT Extras (Speak becomes the full-width
        // hero, Extras never shows) and the gentle-only non-grid toggles (the
        // welcome hero, which Focused View hides); Gentle View offers the full checklist.
        var gentleOnly = row.classList.contains('md-ds-section--gentle-only');
        row.style.display = (focused && (key === 'extras' || gentleOnly)) ? 'none' : '';
      });
      updateSpeakLabel(layout);
    };
    // The Speak checklist item reads as "Let's Communicate" on Focused View (where
    // Speak is the full-width hero) and "Speak Mode" on Gentle View. Kept in sync
    // here so switching the layout on the style page updates the label live.
    var updateSpeakLabel = function(layout) {
      var input = el.querySelector('.md-ds-section__input[data-gst-section="speak"]');
      var row = input && input.closest('.md-ds-section');
      var labelEl = row && row.querySelector('.md-ds-section__label');
      if (labelEl) {
        labelEl.textContent = (layout === 'focused')
          ? i18n.t('lets_communicate', "Let's Communicate")
          : i18n.t('speak_mode', "Speak Mode");
      }
    };
    // Keep the right-panel checklist in the SAME order as the live preview cards:
    // a drag reorders the cards (and the `order` array), so re-sort the section rows
    // to match. The list is built once at open, so without this it would stay frozen
    // in its initial order while the preview moves.
    var reorderSectionList = function() {
      var listEl = el.querySelector('.md-ds-sections__list');
      if (!listEl) { return; }
      var layout = currentLayout();
      var base = defaultOrderFor(previewUser, layout);
      var ord = (order && order.length) ? order.slice() : base.slice();
      base.forEach(function(k) { if (ord.indexOf(k) === -1) { ord.push(k); } });
      var rank = function(row) {
        var input = row.querySelector('.md-ds-section__input');
        var key = input && input.getAttribute('data-gst-section');
        // Focused View pins Speak as the always-top hero (its order slot is ignored
        // by focusedLayout), so pin "Let's Communicate" first to match the preview.
        if (layout === 'focused' && key === 'speak') { return -1; }
        // Gentle View renders the Welcome banner ABOVE the grid, so list it first
        // there too (it's a non-grid toggle, absent from the order array).
        if (layout !== 'focused' && key === 'hero') { return -2; }
        var i = ord.indexOf(key);
        return i === -1 ? 999 : i; // any other non-grid toggle keeps its trailing slot
      };
      Array.prototype.slice.call(listEl.querySelectorAll('.md-ds-section'))
        .sort(function(a, b) { return rank(a) - rank(b); })
        .forEach(function(row) { listEl.appendChild(row); });
    };
    var syncState = function() {
      // Re-query the clone each call — the preview content is rebuilt when the layout
      // changes, so a captured reference would go stale.
      gridEl = liveEl && liveEl.querySelector('.md-ds-preview__clone');
      var layout = currentLayout();
      var vis = readVis();
      // Focused View never shows Extras — Speak becomes the full-width hero instead.
      // Force it off before card-hide + layout so the clone matches the real page.
      if (layout === 'focused') { vis.extras = false; }
      if (liveEl && gridEl) {
        // Reflect the selected display style on the clone so layout-scoped CSS
        // (e.g. the Focused View full-width Speak hero's doubled height) applies to
        // the preview too — the clone inherits the live grid's layout class, so
        // it must be re-stamped when the user switches styles.
        ['gentle', 'focused'].forEach(function(name) {
          gridEl.classList.toggle('md-grid--layout-' + name, layout === name);
        });
        HOME_SECTIONS.forEach(function(s) {
          if (vis[s.key] === undefined) { return; }
          setCardDisplay(s.cardClass, vis[s.key]);
        });
        // Non-grid toggles (welcome hero): gentleOnly ones never show on Focused View.
        EXTRA_HOME_TOGGLES.forEach(function(t) {
          if (vis[t.key] === undefined) { return; }
          var on = vis[t.key] && !(t.gentleOnly && layout === 'focused');
          setCardDisplay(t.cardClass, on);
        });
        var state = gridLayoutState(vis, flagOn ? order : null, layout, focusedHeroKey(previewUser));
        // Reconcile ALL engine-driven state classes (boards-full + the gentle
        // per-card md-grid--fullspan-<key>) so the preview matches the real grid:
        // strip the current set, then add the computed one.
        Array.prototype.slice.call(gridEl.classList).forEach(function(c) {
          if (/^md-grid--(boards-full|boards-right|with-caseload|with-org-mgmt|fullspan-)/.test(c)) { gridEl.classList.remove(c); }
        });
        state.classes.forEach(function(c) { gridEl.classList.add(c); });
        gridEl.style.setProperty('grid-template-areas', state.areasValue, 'important');
        gridEl.style.setProperty('grid-template-rows', state.rows, 'important');
        // Focused View pins the column count to the visible utility-card count so
        // the utility row fills evenly; Gentle View hands columns back to the CSS.
        if (state.columns) { gridEl.style.setProperty('grid-template-columns', state.columns, 'important'); }
        else { gridEl.style.removeProperty('grid-template-columns'); }
        // Mirror the reading-order vars so the clone's small-screen fallback orders
        // cards the same as the real grid (inert above 950px).
        var _oi = state.orderIndices || {};
        Object.keys(_oi).forEach(function(k) { gridEl.style.setProperty('--ord-' + k, _oi[k]); });
        // Stamp the live order back so the persist step can read it.
        liveEl.setAttribute('data-gst-order', JSON.stringify(order));
      }
      refreshGate();
      // Mirror the new card order into the right-panel checklist.
      reorderSectionList();
      // Re-fit AFTER the grid is rebuilt: toggling a card on/off or switching
      // layout changes the preview's height, so the scale has to be recomputed or
      // the modal starts scrolling again.
      _fitPreviewZoom(liveEl);
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
        wireDrag(); // the clone was rebuilt above — re-wire drag onto the fresh cards
        refreshGate();
        // Save the chosen layout IMMEDIATELY (not debounced) — picking a style is a
        // discrete click, so the user's dashboard_layout pref updates the instant
        // they choose, and the dashboard behind the modal reflows right away.
        persist();
      });
    });
    applyLayoutSections(currentLayout());
    syncState();

    // Re-fit on resize / orientation change — this app runs on tablets, where a
    // rotate can halve the available height mid-modal. Self-cleaning: the step's
    // DOM is discarded when the modal closes, so the first callback after that
    // detaches the listener rather than leaking one per modal open.
    try {
      var onPreviewResize = function() {
        if (!liveEl || !document.body.contains(liveEl)) {
          window.removeEventListener('resize', onPreviewResize);
          return;
        }
        _fitPreviewZoom(liveEl);
      };
      window.addEventListener('resize', onPreviewResize);
    } catch (e) { /* fitting is an enhancement — never block the step */ }
    // Drag-to-swap (flagged): let the user rearrange cards by dragging one onto another
    // in the preview. Each swap re-runs syncState (re-rendering the grid + re-stamping the
    // positions for persistence). Wrapped in a function because the preview clone is
    // REBUILT whenever the display style changes (_buildPreviewContent removes + re-clones
    // it), which discards the wired cards/overlays — so the drag MUST be re-wired onto the
    // fresh clone each time (the layout-switch handler calls wireDrag() again). Without
    // this, drag was silently dead after any Gentle↔Focused switch. _wirePreviewDrag
    // guards each card with _gstDragWired (not copied by cloneNode), so re-calling on the
    // same clone never double-wires.
    // NOTE (security review false-positive — "race in drag re-wiring"): there is no async
    // race. _buildPreviewContent (sync DOM swap) → wireDrag() run synchronously in the
    // click handler with no await/promise, so rapid layout switches simply execute in
    // order; the _gstDragWired guard blocks double-wiring on a card, and a rebuilt clone's
    // old cards are removeChild'd (their listeners detached + GC'd, never stale-fired).
    var wireDrag = function() {
      if (!dragEnabled || !liveEl) { return; }
      // The preview is rendered at a CSS `zoom` (single source of truth: the
      // --md-ds-preview-zoom custom property). A child's CSS translate renders at
      // translate × zoom on screen, so pass the zoom factor through — the drag math
      // divides by it to keep the ghost 1:1 under the cursor.
      var previewZoom = 1;
      try { previewZoom = parseFloat(window.getComputedStyle(liveEl).getPropertyValue('--md-ds-preview-zoom')) || 1; } catch (e) { previewZoom = 1; }
      try { _wirePreviewDrag(liveEl, { getVis: readVis, getOrder: function() { return order; }, getDefaultOrder: function() { return defaultOrderFor(previewUser, currentLayout()); }, getLayout: function() { return currentLayout(); }, setOrder: function(o) { order = o; liveEl.setAttribute('data-gst-order', JSON.stringify(order)); }, onChange: onUserChange, scale: previewZoom, hintEl: el.querySelector('.md-ds-preview__legend-hint') }); } catch (e) { /* drag is an enhancement — never block the step */ }
    };
    wireDrag();
  } catch (e) { /* preview + gating are decorative — never block the step */ }

  // Orientation overlay (shown by CSS at ≤640px): Continue Anyway hides it so the step
  // stays usable in portrait. Rotating to landscape widens past 640px and auto-hides it.
  // The old Rotate Device button and its `screen.orientation.lock('landscape')` handler
  // were removed with the button — see _orientationOverlayHtml for why.
  try {
    var orientation = el.querySelector('.md-ds-orientation');
    var dismissBtn = orientation && orientation.querySelector('[data-gst-dismiss]');
    if (dismissBtn && !dismissBtn._gstWired) {
      dismissBtn._gstWired = true;
      dismissBtn.addEventListener('click', function() {
        if (orientation) { orientation.style.setProperty('display', 'none', 'important'); }
      });
    }
  } catch (e) { /* never block the step */ }
}

// Display Style tour — a Shepherd-driven, single-page modal for choosing the
// dashboard display style + customizing the dashboard (formerly the
// "getting-started-tour" component; renamed since it's no longer the
// getting-started entry point). The component renders only the trigger badge;
// Shepherd portals the modal into <body>. It reuses the shared `tour` service:
// each addSteps() spins up a FRESH Shepherd.Tour (see ember-shepherd
// `_initialize`), so this never collides with the home tour.
// (Distinct from the legacy `getting-started` checklist modal, which uses the
// `modal` service — that is a separate, unrelated feature.)
export default Component.extend({
  tagName: '',

  tour: service('tour'),
  appState: service('app-state'),

  // Register a DIRECT opener on the shared app-state service so any component
  // (e.g. the home "Edit Dashboard" card) can open this tour at a specific step
  // by CALLING it — rather than relying on the `_dashboardDesignTrigger` observer
  // below firing across components. A cross-component observer used as a one-shot
  // event bus is fragile (it won't re-fire for an unchanged value, and home-tour
  // hit the same class of issue — see its didInsert/sessionStorage fallbacks), so
  // the direct call is the reliable path and the observer is a belt-and-suspenders
  // fallback for callers that only set the signal.
  init: function() {
    this._super(...arguments);
    this.set('appState.dashboard_design_opener', this._startDisplayStyle.bind(this));
    var self = this;
    this.onStartDisplayStyle = function() {
      self.send('startDisplayStyle');
    };
  },

  willDestroy: function() {
    if (this.get('appState.dashboard_design_opener')) {
      this.set('appState.dashboard_design_opener', null);
    }
    this._super.apply(this, arguments);
  },

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
    // The dashboard user we read + WRITE. `appState.referenced_user` is a COMPUTED
    // that returns currentUser EXCEPT during a speak-mode modeling session (it then
    // returns the modeled communicator). This component renders only on user.home,
    // where speak_mode/modeling is off, so referenced_user === currentUser here — and
    // reads and writes both go through this same resolved `user`, so the edit never
    // reads one identity and writes another. (`|| currentUser` is a belt-and-suspenders
    // guard for the brief boot window before the computed settles.) This is also the
    // single wire-in point for a future "supervisor edits a supervisee's dashboard".
    var user = this.get('appState.referenced_user') || this.get('appState.currentUser');
    if (!user) { return; }
    // Scope every DOM read to THIS step's element so multiple display pages (the
    // original config step + the copy that follows it) persist independently and
    // never read each other's controls. Falls back to the first display modal in
    // the DOM when no root is passed (single-step callers).
    root = root || document.querySelector('.md-ds-modal--display');
    if (!root) { return; }
    var prefs = Object.assign({}, user.get('preferences') || {});
    var changed = false;

    // Layout choice
    var sel = root.querySelector('.md-ds-select.is-selected');
    var layout = sel && sel.getAttribute('data-gst-layout');
    if (layout && prefs.dashboard_layout !== layout) {
      prefs.dashboard_layout = layout;
      changed = true;
    }

    // Per-section visibility — build the map from the checked boxes, scoped to
    // the sections actually available to this user.
    var boxes = root.querySelectorAll('.md-ds-section__input');
    if (boxes.length) {
      var visibleKeys = [];
      Array.prototype.forEach.call(boxes, function(box) {
        if (box.checked) { visibleKeys.push(box.getAttribute('data-gst-section')); }
      });
      var map = sectionsMapFor(user, visibleKeys);
      // Non-grid toggles (welcome hero) aren't in availableHomeSections, so
      // sectionsMapFor drops them — carry their checkbox state into the map.
      EXTRA_HOME_TOGGLES.forEach(function(t) {
        map[t.key] = visibleKeys.indexOf(t.key) !== -1;
      });
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

    // Drag-to-reorder order (flagged) — read the final order the show hook stamped
    // onto the live element. Order is a SEQUENCE, so compare the arrays directly.
    var live = root.querySelector('.md-ds-preview__live');
    if (live && live.getAttribute('data-gst-drag') === '1') {
      var order = [];
      try { order = JSON.parse(live.getAttribute('data-gst-order') || '[]') || []; } catch (e) { order = []; }
      if (JSON.stringify(order) !== JSON.stringify(prefs.dashboard_order || [])) {
        prefs.dashboard_order = order;
        changed = true;
      }
    }

    if (changed) {
      // Bump the device dirty bit on a COPY too (never mutate the original device obj).
      prefs.device = Object.assign({}, prefs.device || {}, { updated: true });
      // Whole-attribute set with a FRESH object reference → ember-data registers a real
      // change (serialized + saved) and fires the property change (home re-renders).
      user.set('preferences', prefs);
      // Remember that the dashboard actually changed + the in-flight save, so the
      // tour's Done/close handler can hard-reload the home page (landing at the top)
      // only when something changed, and only AFTER the new layout has persisted.
      this._dashboardDesignChanged = true;
      this._dashboardSavePromise = (user.save) ? user.save() : null;
    }
  },

  // After the Dashboard Design modal closes (Done or ×) following a real change,
  // hard-RELOAD the home page. The re-rendered grid otherwise leaves the viewport
  // scrolled to the bottom; a reload lands cleanly at the TOP — a scroll-to-top is
  // unreliable cross-browser and adds motion AAC users don't need. Deferred until
  // the save persists so the reloaded page reflects the chosen layout.
  _reloadAfterDashboardDesign: function() {
    if (!this._dashboardDesignChanged) { return; }
    this._dashboardDesignChanged = false;
    var _this = this;
    var p = this._dashboardSavePromise;
    this._dashboardSavePromise = null;
    // Only reload if this tour is still mounted (i.e. the user is still on the
    // home page) when the save settles. If they navigated away in the meantime
    // the component is torn down — reloading then would yank them out of
    // wherever they went; skip it. The saved layout still applies on their next
    // visit to home, so nothing is lost.
    var doReload = function() {
      if (_this.isDestroyed || _this.isDestroying) { return; }
      try { window.location.reload(); } catch (e) { /* noop */ }
    };
    if (p && typeof p.then === 'function') { p.then(doReload, doReload); }
    else { doReload(); }
  },

  // Welcome (first) page content (HTML string — Shepherd renders `text` via
  // innerHTML). A short lead, a horizontal 1→2 progress stepper (reusing the
  // .beta-welcome-steps__num glass badges + a connecting line), and two
  // NON-actionable label cards sitting under their numbers that just name the
  // two steps to come. Every string is static i18n.t (generator-friendly); the
  // display-style + customize step titles are reused so the labels match what's
  // next. The footer "Get started" advances the tour.
  _welcomeContentHtml: function() {
    // Step 2 is OPTIONAL now (the display-style page carries its own Done button
    // and only links onward to the customize page), so the lead no longer promises
    // "two quick steps" — it names the second as a choice.
    var lead = i18n.t('display_style_welcome_text', "Design your dashboard: choose a display style, then customize what appears on it if you'd like.");
    var t1 = i18n.t('display_style_display_title', "Choose your display style");
    var t2 = i18n.t('display_style_layout_title', "Customize your dashboard");
    // Non-actionable label cards (no mockup, no click-to-jump) — each just names a
    // step and sits under its number. The footer "Get started" advances the tour.
    var card = function(title) {
      return '<div class="md-ds-welcome-card">' +
          '<span class="md-ds-welcome-card__title">' + title + '</span>' +
        '</div>';
    };
    return '' +
      '<div class="md-ds-welcome">' +
        '<p class="md-ds-welcome__lead">' + lead + '</p>' +
        '<div class="md-ds-welcome__progress" aria-hidden="true">' +
          '<span class="md-ds-welcome__num beta-welcome-steps__num">1</span>' +
          '<span class="md-ds-welcome__line"></span>' +
          '<span class="md-ds-welcome__num beta-welcome-steps__num">2</span>' +
        '</div>' +
        '<div class="md-ds-welcome__cards">' +
          card(t1) +
          card(t2) +
        '</div>' +
      '</div>';
  },

  // Eyebrow pill + heading, mirroring the home-tour decorated title. Shepherd
  // renders `title` via innerHTML, so an HTML string is the supported approach;
  // every piece comes from i18n, never user input.
  _decoratedTitle: function(headingKey, headingDefault) {
    // Deliberately GENERIC — the modal opens from more than one page (home dashboard and
    // caseload today), so the eyebrow must not name any one of them. Naming the current
    // page would also mean a phrase per page: `i18n_generator` only extracts LITERAL
    // keys, so a "<page> + Design" concatenation could not be translated at all, and word
    // order differs by locale.
    var eyebrow = i18n.t('display_style_eyebrow', "Display Design");
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
    // Pre-select the user's SAVED layout (default gentle) so re-opening the
    // modal reflects what's stored, not a fixed default.
    var saved = this.get('appState.currentUser.preferences.dashboard_layout') || 'gentle';
    if (['gentle', 'focused'].indexOf(saved) === -1) { saved = 'gentle'; }
    // Each card is paired with a live preview of the CURRENT page rendered in that
    // style, joined by a `→`. The preview slot is emitted here but filled in by
    // _buildStylePreviews on show (it needs the rendered page to clone). When there is
    // no shell to preview the slot stays empty and collapses via :empty in the
    // stylesheet, so the chooser degrades to the plain cards rather than showing a
    // broken frame.
    var withPreview = this._canPreviewPage();
    // The CARD is presentational (a <div>); the SELECT BUTTON beneath it is the control.
    // Splitting them means the whole card is no longer one big click target — the choice
    // is made by a button that says what it does ("Select Gentle View"), which also gives
    // a screen reader a named action instead of a pressed-state region containing a
    // heading and a bullet list. `data-gst-layout` + `is-selected` therefore live on the
    // BUTTON, and the card reflects the choice via `:has()` in the stylesheet.
    var selectedLabel = i18n.t('display_style_selected', "Selected…");
    var option = function(key, label, desc, previewLabel, selectLabel) {
      var sel = key === saved;
      // Card and button are SIBLINGS in a `__choice` column — the button sits outside and
      // below the card, not within it.
      // Both labels are rendered and swapped by CSS on `.is-selected` rather than having
      // the click handler rewrite textContent: the handler stays free of copy, and neither
      // string can drift out of i18n.
      var card = '<div class="md-ds-optionrow__choice">' +
        '<div class="md-ds-option">' +
          '<span class="md-ds-option__text">' +
            '<span class="md-ds-option__label">' + label + '</span>' +
            // desc is a <div> (not a <span>) so it can hold block content — both
            // cards pass a "may be a good fit if you:" lead + bracketed bullet list.
            '<div class="md-ds-option__desc">' + desc + '</div>' +
          '</span>' +
        '</div>' +
        '<button type="button" class="md-ds-select' + (sel ? ' is-selected' : '') + '" data-gst-layout="' + key + '" aria-pressed="' + (sel ? 'true' : 'false') + '">' +
          '<span class="md-ds-select__check" aria-hidden="true">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' +
          '</span>' +
          '<span class="md-ds-select__label md-ds-select__label--idle">' + selectLabel + '</span>' +
          '<span class="md-ds-select__label md-ds-select__label--done">' + selectedLabel + '</span>' +
        '</button>' +
      '</div>';
      if (!withPreview) { return card; }
      return '<div class="md-ds-optionrow">' +
        card +
        // Decorative: the preview is captioned, so the arrow adds no information for
        // a screen reader and is hidden rather than given a redundant label.
        '<span class="md-ds-optionrow__arrow" aria-hidden="true">' +
          '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="12" x2="19" y2="12"/><polyline points="13 6 19 12 13 18"/></svg>' +
        '</span>' +
        // Caption FIRST — it labels the panel before you look at it, at every width.
        // `<figcaption>` is valid as either the first or last child of `<figure>`, so this
        // needs no `order`/`column-reverse` workaround.
        '<figure class="md-ds-stylepreview" data-gst-stylepreview="' + key + '">' +
          '<figcaption class="md-ds-stylepreview__caption">' + previewLabel + '</figcaption>' +
          '<div class="md-ds-stylepreview__viewport"></div>' +
        '</figure>' +
      '</div>';
    };
    // Each layout card's description is a lead line + a bracketed 3-item bullet
    // list ("May be a good fit if you:"). Kept inline with LITERAL i18n.t calls
    // (not a shared helper with dynamic keys) so i18n_generator's static parser
    // can extract every key. The repurposed _desc keys carry the lead; item1-3
    // carry the bullets.
    var gentleDesc =
      '<span class="md-ds-option__desc-lead">' + i18n.t('display_style_layout_gentle_desc', "May be a good fit if you:") + '</span>' +
      '<div class="md-ds-option__bracket">' +
        '<ul class="md-ds-option__list">' +
          '<li>' + i18n.t('display_style_layout_gentle_item1', "Are sensitive to bold elements") + '</li>' +
          '<li>' + i18n.t('display_style_layout_gentle_item3', "Prefer a softer, more relaxed interface") + '</li>' +
        '</ul>' +
      '</div>';
    var focusedDesc =
      '<span class="md-ds-option__desc-lead">' + i18n.t('display_style_layout_focused_desc', "May be a good fit if you:") + '</span>' +
      '<div class="md-ds-option__bracket">' +
        '<ul class="md-ds-option__list">' +
          '<li>' + i18n.t('display_style_layout_focused_item1', "Benefit from stronger visual cues") + '</li>' +
          '<li>' + i18n.t('display_style_layout_focused_item3', "Prefer a bolder, more direct interface") + '</li>' +
        '</ul>' +
      '</div>';
    // Preview captions name the style, so each figure stands on its own for a screen
    // reader (the arrow beside it is decorative). Literal i18n.t calls, per the
    // generator's static-parse requirement.
    var gentleCaption = i18n.t('display_style_preview_caption_gentle', "This page in Gentle View");
    var focusedCaption = i18n.t('display_style_preview_caption_focused', "This page in Focused View");
    // Full phrases per option, not "Select " + label — i18n_generator only extracts
    // LITERAL keys, so a concatenation would never be translated, and word order after
    // the verb differs by locale.
    var gentleSelect = i18n.t('display_style_select_gentle', "Select Gentle View");
    var focusedSelect = i18n.t('display_style_select_focused', "Select Focused View");
    return '' +
      '<div class="md-ds-options' + (withPreview ? ' md-ds-options--with-previews' : '') + '">' +
        // Gentle View is listed FIRST (it's the site default), Focused View second.
        // The KEY is 'gentle' — the value persisted in preferences.dashboard_layout
        // (and allow-listed below). The user-facing LABEL is "Gentle View".
        option('gentle', i18n.t('display_style_layout_gentle', "Gentle View"), gentleDesc, gentleCaption, gentleSelect) +
        '<span class="md-ds-options__or" aria-hidden="true">' + i18n.t('display_style_or_divider', "OR") + '</span>' +
        // The layout KEY is 'focused' — the layout engine selects on
        // `layout === 'focused'` and it's the value persisted in
        // preferences.dashboard_layout. The user-facing LABEL is "Focused View".
        option('focused', i18n.t('display_style_layout_focused', "Focused View"), focusedDesc, focusedCaption, focusedSelect) +
      '</div>';
  },

  // Can we show the per-style page previews? Unlike `_onDashboardPage` (which asks the
  // narrower "is the dashboard GRID here", because the customize page clones that grid
  // specifically), this only needs a page shell to photograph — which every route has.
  // That is what lets the caseload page show previews where the old single-preview
  // panel showed nothing at all.
  _canPreviewPage: function() {
    return !!_livePageShell();
  },

  // Reuses the board-detail landscape-orientation overlay (same classes +
  // rotate animation) on this step. Always in the DOM; a ≤640px media query
  // shows it (and rotating to landscape widens past 640px, auto-hiding it).
  // IDs are namespaced so they never collide with the board-detail instance.
  _orientationOverlayHtml: function(idSuffix) {
    // The overlay is emitted by more than one step; suffix the SVG def IDs so two
    // rendered step panels never share an id (duplicate ids are invalid and make
    // url(#id) refs resolve to the first match). Callers pass a per-step suffix.
    idSuffix = idSuffix || '';
    return '' +
      '<div class="md-board-detail-portrait-overlay md-ds-orientation" role="dialog" aria-label="' + i18n.t('board_detail_landscape_recommended', "Landscape mode recommended") + '">' +
        '<div class="md-board-detail-portrait-overlay__card">' +
          '<span class="md-board-detail-portrait-overlay__accent" aria-hidden="true"></span>' +
          '<div class="md-board-detail-portrait-overlay__phone" aria-hidden="true">' +
            '<svg class="md-board-detail-portrait-overlay__phone-arc" width="76" height="76" viewBox="0 0 76 76" fill="none" aria-hidden="true">' +
              '<defs>' +
                '<linearGradient id="md-ds-rot-grad' + idSuffix + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#5ED0C0"/><stop offset="100%" stop-color="#1C7E72"/></linearGradient>' +
                '<filter id="md-ds-rot-shadow' + idSuffix + '" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="1.5" stdDeviation="2" flood-color="#2A9D8F" flood-opacity="0.5"/></filter>' +
              '</defs>' +
              '<g filter="url(#md-ds-rot-shadow' + idSuffix + ')" fill="none" stroke-linecap="round" stroke-linejoin="round">' +
                '<path class="md-board-detail-portrait-overlay__arc-track" d="M34 14 C62 8 75 34 65 48" stroke="currentColor" stroke-width="3" stroke-opacity="0.20"/>' +
                '<path class="md-board-detail-portrait-overlay__arc-comet" d="M34 14 C62 8 75 34 65 48" pathLength="100" stroke="url(#md-ds-rot-grad' + idSuffix + ')" stroke-width="3.5"/>' +
                '<polyline class="md-board-detail-portrait-overlay__arc-head" points="59 42 65 48 71 42" stroke="url(#md-ds-rot-grad' + idSuffix + ')" stroke-width="3.5"/>' +
              '</g>' +
            '</svg>' +
            '<svg class="md-board-detail-portrait-overlay__phone-svg" width="76" height="76" viewBox="0 0 76 76" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
              '<rect x="30" y="24" width="16" height="28" rx="4.5"/><line x1="35" y1="47" x2="41" y2="47"/>' +
            '</svg>' +
          '</div>' +
          '<h2 class="md-board-detail-portrait-overlay__title">' + i18n.t('board_detail_landscape_recommended', "Landscape mode recommended") + '</h2>' +
          '<p class="md-board-detail-portrait-overlay__desc">' + i18n.t('display_style_landscape_explanation', "Rotate your device to landscape to see the full preview and choose your home page layout.") + '</p>' +
          // "Continue Anyway" ONLY. A "Rotate Device" button used to sit here; it was
          // removed 2026-08-15 because users read it as a control that would rotate the
          // device for them. It could not: its handler called
          // `screen.orientation.lock('landscape')`, which is unsupported on iOS Safari
          // and requires fullscreen on Chrome, so in practice it silently did nothing.
          // The overlay's own copy already says "Rotate your device to landscape", which
          // is the instruction — it does not need a button that appears to perform it.
          // This matches the other two orientation overlays (board-detail.hbs,
          // create-board-new.hbs), which have only ever offered "Continue Anyway".
          '<div class="md-board-detail-portrait-overlay__actions">' +
            '<button type="button" class="md-board-detail-portrait-overlay__btn md-board-detail-portrait-overlay__btn--secondary" data-gst-dismiss>' + i18n.t('board_detail_continue_anyway', "Continue Anyway") + '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
  },

  // Compact, professional miniature of the Gentle View layout (the current home
  // dashboard) shown below the options. Decorative (aria-hidden); the live
  // per-option preview swap is wired later. Built as an HTML string for the
  // Shepherd step text. The grid areas mirror the real home layout:
  // Caseload + Speak on top, Boards (tall) on the left, Extras + Org stacked
  // on the right.
  // Preview legend tag, labeled with the user's selected layout so the preview
  // reads as "this is the [Gentle View/Focused View] layout you picked". Three
  // static i18n.t calls (generator-friendly); _onDisplayShow updates the tag live
  // when the layout selection changes.
  _previewLabel: function(layout) {
    if (layout === 'focused') { return i18n.t('display_style_preview_label_focused', "Preview — Focused View"); }
    return i18n.t('display_style_preview_label', "Preview — Gentle View");
  },

  // Live, scaled-down copy of THIS user's real home dashboard — _onDisplayShow
  // clones the actual `.md-grid--dashboard` into `.md-ds-preview__live` so the
  // user sees their exact home page. Parameterized so the same builder serves both
  // modal pages:
  //   { toggles: true }  → page 2 (home layout): content checkboxes + drag-to-swap
  //   { toggles: false } → page 1 (display style): read-only preview, no controls
  // `opts.drag` (default true) is ANDed with the feature flag; pass false to force
  // a static preview. Section keys are fixed identifiers, so the JSON is safe in a
  // single-quoted attribute.
  // Is the live home dashboard grid on screen? This component is mounted on the
  // caseload page as well as home (app-navbar-authenticated-inner.hbs) so a
  // supporter can switch view style from either, and everything in this modal that
  // previews or configures the dashboard works by cloning that grid. The single
  // authority for "can we show dashboard-dependent UI" — used by both
  // `_gentlePreviewHtml` and `_buildSteps`, so the preview and the step list can
  // never disagree about which page we're on. Excludes the modal's own clone.
  _onDashboardPage: function() {
    return !!document.querySelector('.md-grid--dashboard:not(.md-ds-preview__clone)');
  },

  _gentlePreviewHtml: function(opts) {
    opts = opts || {};
    // No grid to clone (see _onDashboardPage) — `_buildGentleViewClone` would bail
    // and leave an empty preview panel, so render nothing at all. Off-dashboard
    // _buildSteps also drops the pages that depend on the preview, so in practice
    // this is the belt to that braces.
    if (!this._onDashboardPage()) { return ''; }
    var withToggles = opts.toggles !== false;
    var dragOn = (opts.drag !== false) && !!this.get('appState.feature_flags.dashboard_drag_layout');
    var savedLayout = this.get('appState.currentUser.preferences.dashboard_layout') || 'gentle';
    var savedOrder = this.get('appState.currentUser.preferences.dashboard_order');
    var savedOrderJson = JSON.stringify((savedOrder && savedOrder.length) ? savedOrder : []);
    // Combined legend: the bracketed preview tag and (when dragging is enabled) the
    // reorder instruction read as one modern, professional line directly above the
    // live preview — instead of two competing labels above and below the controls.
    var legend = '' +
      '<div class="md-ds-preview__legend">' +
        '<span class="md-ds-preview__legend-tag">' + this._previewLabel(savedLayout) + '</span>' +
        (dragOn ?
          '<span class="md-ds-preview__legend-dot" aria-hidden="true"></span>' +
          '<span class="md-ds-preview__legend-hint">' + i18n.t('display_style_drag_hint', "Drag rows to change row position or drag the smaller buttons on the same row to reorder them on the row") + '</span>'
          : '') +
      '</div>';
    // Two modern checklist items below the step header (customize step only),
    // joined by an "and/or" divider — a quick "here's what you can do" summary of
    // the page's two actions (reorder by dragging, toggle visibility).
    var howtoBullet = '<span class="md-ds-howto__bullet" aria-hidden="true"></span>';
    var howto = withToggles ? (
      '<div class="md-ds-howto">' +
        '<span class="md-ds-howto__item">' + howtoBullet +
          '<span class="md-ds-howto__label">' + i18n.t('display_style_howto_drag', "Drag cards to move them around") + '</span>' +
        '</span>' +
        '<span class="md-ds-howto__sep">' + i18n.t('display_style_howto_andor', "and/or") + '</span>' +
        '<span class="md-ds-howto__item">' + howtoBullet +
          '<span class="md-ds-howto__label">' + i18n.t('display_style_howto_toggle', "Choose what appears on your dashboard") + '</span>' +
        '</span>' +
      '</div>'
    ) : '';
    return '' +
      howto +
      '<div class="md-ds-preview' + (withToggles ? ' md-ds-preview--with-toggles' : '') + '">' +
        (withToggles ? this._sectionTogglesHtml() : '') +
        legend +
        '<div class="md-ds-preview__live" data-gst-drag="' + (dragOn ? '1' : '') + '" data-gst-order=\'' + savedOrderJson + '\'>' +
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
      '<div class="md-ds-empty" role="status" aria-live="polite">' +
        '<div class="md-ds-empty__card">' +
          '<svg class="md-ds-empty__icon" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>' +
          '<div class="md-ds-empty__title">' + i18n.t('display_style_empty_title', "Nothing to display") + '</div>' +
          '<div class="md-ds-empty__text">' + i18n.t('display_style_empty_text', "Select at least one element to display on your home page.") + '</div>' +
        '</div>' +
      '</div>';
  },

  // Modern checkbox list of the home-dashboard sections available to THIS user
  // (Boards/Speak/Extras always; Caseload + Organizations by user type). All
  // start checked unless the user previously hid one. Toggling a box live-hides
  // the matching card in the preview clone (wired in _onDisplayShow) and is
  // saved to preferences.dashboard_sections on Next.
  _sectionTogglesHtml: function() {
    // Dashboard user (see _persistDisplaySelection): referenced_user || currentUser.
    var user = this.get('appState.referenced_user') || this.get('appState.currentUser');
    // Order the checklist to MATCH the live preview / dashboard order (was an
    // alphabetical sort): rank each available section by its index in the active
    // layout's saved order so the list reads top-to-bottom the way the cards lay
    // out. `.slice()` so we never mutate the array availableHomeSections returns.
    var layout = (user && user.get('preferences.dashboard_layout')) || 'gentle';
    if (['gentle', 'focused'].indexOf(layout) === -1) { layout = 'gentle'; }
    // Role-aware default order so a supervisor's checklist ranks by SUPERVISOR order
    // (matching their grid), not the communicator default.
    var base = defaultOrderFor(user, layout);
    var savedOrder = user && user.get('preferences.dashboard_order');
    var ord = (savedOrder && savedOrder.length) ? savedOrder.slice() : base.slice();
    base.forEach(function(k) { if (ord.indexOf(k) === -1) { ord.push(k); } });
    var rank = function(s) { var i = ord.indexOf(s.key); return i === -1 ? 999 : i; };
    var sections = availableHomeSections(user).slice().sort(function(a, b) {
      return rank(a) - rank(b);
    });
    var toggleItem = function(key, label, gentleOnly) {
      var checked = sectionHidden(user, key) ? '' : ' checked';
      // `gentleOnly` rows are hidden when Focused View is selected (applyLayoutSections).
      var extraClass = gentleOnly ? ' md-ds-section--gentle-only' : '';
      return '' +
        '<label class="md-ds-section' + extraClass + '">' +
          '<input type="checkbox" class="md-ds-section__input" data-gst-section="' + key + '"' + checked + '>' +
          '<span class="md-ds-section__box" aria-hidden="true">' +
            '<svg class="md-ds-section__check" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' +
          '</span>' +
          '<span class="md-ds-section__label">' + label + '</span>' +
        '</label>';
    };
    var items = sections.map(function(s) {
      // In THIS list the Speak section reads as "Let's Communicate" on Focused View
      // (where it's the full-width hero) but as its normal "Speak Mode" on Gentle
      // View. _onDisplayShow.updateSpeakLabel keeps it in sync if the layout changes.
      var label = (s.key === 'speak' && layout === 'focused') ? i18n.t('lets_communicate', "Let's Communicate") : sectionLabel(s);
      return toggleItem(s.key, label, false);
    }).join('');
    // Non-grid toggles (e.g. the welcome hero banner) — rendered after the cards.
    items += EXTRA_HOME_TOGGLES.map(function(t) {
      return toggleItem(t.key, i18n.t(t.labelKey, t.labelDefault), t.gentleOnly);
    }).join('');
    return '' +
      '<div class="md-ds-sections">' +
        '<div class="md-ds-sections__title">' + i18n.t('display_style_sections_label', "Choose what appears on your home page") + '</div>' +
        '<div class="md-ds-sections__list">' + items + '</div>' +
      '</div>';
  },

  // Step script. Welcome page → "choose your display style" page. More steps
  // get appended here as the flow grows (footer Back/Next + progress dots come
  // from the home-tour styling we reuse).
  _buildSteps: function() {
    var component = this;
    // OFF the dashboard (caseload, boards, reports…) this modal is a single
    // decision: pick a display style. The "Customize your dashboard" page and the
    // preview both work by cloning the live `.md-grid--dashboard`, which only
    // exists on home — off-dashboard that page would render an empty frame with
    // toggles for cards that aren't on screen. So the flow collapses to the one
    // meaningful page, whose primary button becomes "Done" (below).
    // The welcome page goes too: it exists purely to introduce a TWO-step flow
    // ("Design your dashboard in two quick steps…" + a 1→2 stepper), so keeping it
    // in front of a single page would advertise a step that never comes.
    // Steps are built per tour-open (see _startDisplayStyle), so this DOM check
    // always reflects the page the user is actually on.
    var onDashboard = this._onDashboardPage();
    var steps = [
      // Step 1 — welcome (centered intro). Dashboard only — see above.
      {
        id: 'display_style_welcome',
        title: this._decoratedTitle('display_style_welcome_title', "Customize your dashboard"),
        // Roomier welcome page: a short lead, a 1→2 progress stepper, and two
        // mini-mockup cards previewing the next two steps (see _welcomeContentHtml).
        text: this._welcomeContentHtml(),
        // md-ds-modal scopes the size/position overrides to THIS modal so the
        // home-tour welcome/outro keep the shared intro default; --welcome doubles
        // its size for the stepper + preview cards.
        classes: 'md-tour__step md-tour__step--intro md-ds-modal md-ds-modal--welcome',
        when: {
          // Step-level show OVERRIDES the default (_onShow from defaultStepOptions),
          // so _onWelcomeShow re-runs the shared centered-step setup AND wires the
          // showcase cards to advance the flow on click.
          show: function() { _onWelcomeShow.call(this); }
        },
        buttons: [
          {
            text: i18n.t('display_style_skip', "Maybe later"),
            type: 'cancel',
            classes: 'md-tour__btn md-tour__btn--ghost'
          },
          {
            text: i18n.t('display_style_begin', "Get started"),
            type: 'next',
            classes: 'md-tour__btn md-tour__btn--primary'
          }
        ]
      },
      // Step 2 — "Choose your display style": the layout style cards, each paired with
      // a `→` and its OWN read-only preview of the current page in that style
      // (_styleCardsHtml + _buildStylePreviews). The user only picks a style here;
      // configuring what appears + arranging it happens on the next page. The same
      // _onDisplayShow hook wires both pages — on this one there are no toggles and
      // drag is off, so it only wires the style cards + gate.
      //
      // The old single swapping preview panel (`_gentlePreviewHtml`) is NOT rendered
      // here any more: it showed one style at a time below the cards, which is what the
      // per-card previews replace. It still serves the customize step below, where the
      // preview is interactive (toggles + drag) and only one is wanted.
      {
        id: 'display_style_display',
        title: this._decoratedTitle('display_style_display_title', "Choose your display style"),
        text: this._styleCardsHtml() + this._orientationOverlayHtml('-display'),
        when: {
          show: function() { _onDisplayShow.call(this, component); },
          // Persist whenever this step is HIDDEN — Next, Back, OR closing the modal
          // (X / Esc / "Maybe later"). Shepherd fires `hide` while the step's DOM is
          // still present, so the selection is readable. Scoped to THIS step's element
          // (`this.el`) so the two display pages never read each other's controls.
          hide: function() { try { component._persistDisplaySelection(this.el); } catch (e) { /* never block close */ } }
        },
        classes: 'md-tour__step md-tour__step--intro md-ds-modal md-ds-modal--display',
        // Off-dashboard this is the ONLY step: nowhere to go Back to, and no
        // customize page to continue to — just Done.
        buttons: (onDashboard ? [
          {
            text: i18n.t('display_style_back', "Back"),
            type: 'back',
            classes: 'md-tour__btn md-tour__btn--ghost'
          },
          {
            // Continuing to the customize page is OPTIONAL now that Done lives on
            // this page, so it reads as a link rather than a second solid button
            // competing with the primary action. Labelled with that page's own
            // title, so the link names exactly where it goes.
            // No `type`: ember-shepherd's makeButton passes a typeless button
            // straight through (dist/utils/buttons.js), so `action` is what runs.
            text: i18n.t('display_style_layout_title', "Customize your dashboard"),
            action: function() { component.get('tour').next(); },
            classes: 'md-tour__btn md-tour__btn--link'
          }
        ] : []).concat([
          {
            // Done COMPLETES from this page in both cases, so the user can finish as
            // soon as they've picked a style instead of being marched through the
            // customize page. Completing (not cancelling) fires the same end handler
            // the flow already used, and this step's `hide` hook above still saves
            // the selection, so the save + reload path is unchanged.
            // Driven through the tour SERVICE captured in `component` rather than
            // `this`, so it never depends on how Shepherd binds button callbacks.
            // (Gate: the show hook keeps it disabled until a style is picked.)
            text: i18n.t('display_style_done', "Done"),
            action: function() { component.get('tour').complete(); },
            classes: 'md-tour__btn md-tour__btn--primary'
          }
        ])
      },
      // Step 3 — "Choose your home page layout": NO style cards. Shows the live
      // preview of the style picked on page 2's predecessor, the "Choose what appears
      // on your home page" toggles, and drag-to-swap. The same _onDisplayShow hook
      // wires it — here there are no style cards, so it wires the toggles + drag + gate.
      {
        id: 'display_style_layout',
        title: this._decoratedTitle('display_style_layout_title', "Customize your dashboard"),
        text: this._gentlePreviewHtml({ toggles: true }) + this._orientationOverlayHtml('-layout'),
        when: {
          show: function() { _onDisplayShow.call(this, component); },
          hide: function() { try { component._persistDisplaySelection(this.el); } catch (e) { /* never block close */ } }
        },
        classes: 'md-tour__step md-tour__step--intro md-ds-modal md-ds-modal--display',
        buttons: [
          {
            text: i18n.t('display_style_back', "Back"),
            type: 'back',
            classes: 'md-tour__btn md-tour__btn--ghost'
          },
          {
            text: i18n.t('display_style_done', "Done"),
            // Last step — completes the tour; the `hide` hook saves this page.
            type: 'next',
            classes: 'md-tour__btn md-tour__btn--primary'
          }
        ]
      }
    ];
    // Off-dashboard: drop the welcome intro and the "Customize your dashboard"
    // page, leaving just the style chooser. Filter by id rather than slicing so
    // the mapping stays readable if the step order ever changes.
    if (!onDashboard) {
      steps = steps.filter(function(s) { return s.id === 'display_style_display'; });
    }
    return steps;
  },

  // Another component can open the Dashboard Design modal at a specific step by
  // setting appState.open_dashboard_design (e.g. the home "Edit Dashboard" button
  // sets 'display' to land on the "choose your display style" page). We consume the
  // signal, reset it, and start the tour at the matching step.
  _dashboardDesignTrigger: observer('appState.open_dashboard_design', function() {
    // The signal can fire while this component is mid-teardown (route change);
    // don't start a tour against a destroyed component.
    if (this.isDestroyed || this.isDestroying) { return; }
    var step = this.get('appState.open_dashboard_design');
    if (!step) { return; }
    this.set('appState.open_dashboard_design', null);
    this._startDisplayStyle(step === 'display' ? 'display_style_display' : null);
  }),

  _startDisplayStyle: function(startStepId) {
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
    try { document.body.classList.add('md-ds-active'); } catch (e) { /* noop */ }
    var _this = this;
    tour.addSteps(this._buildSteps()).then(function() {
      if (tour.tourObject) {
        // The display step's `hide` hook (which saves) runs BEFORE these end events,
        // so by now _dashboardSavePromise/_dashboardDesignChanged are set. Reload the
        // home page after Done (complete) or × (cancel) when the dashboard changed.
        var onEnd = function() {
          _clearCentered();
          _this._reloadAfterDashboardDesign();
        };
        tour.tourObject.on('complete', onEnd);
        tour.tourObject.on('cancel', onEnd);
      }
      // Start at a specific step when requested (e.g. the home "Edit Dashboard"
      // button jumps straight to the display-style page); otherwise begin at the
      // welcome step. Activate via start() then jump in the SAME tick (the browser
      // paints only after the callback, so the welcome step never flashes).
      tour.start();
      if (startStepId && tour.tourObject) {
        try { tour.tourObject.show(startStepId); } catch (e) { /* stay on welcome */ }
      }
    });
  },

  actions: {
    startDisplayStyle: function() {
      this._startDisplayStyle();
    }
  }
});
