import Component from '@ember/component';
import LingoLinq from '../app';
import modal from '../utils/modal';
import $ from 'jquery';
import { htmlSafe } from '@ember/template';
import { later as runLater, cancel as runCancel } from '@ember/runloop';
import { observer } from '@ember/object';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';
import i18n from '../utils/i18n';
import RSVP from 'rsvp';
import { color_for_type, cached_pos_for_label, words_needing_lookup, resolve_labels_pos } from '../utils/parts_of_speech';

// No-progress stall watchdog window (ms). This is NOT a total-load deadline — it's the
// maximum GAP with zero image progress before the preview gives up and lifts the loading
// overlay (every settled image re-arms it; see arm_stall_watchdog). It only ever fires on
// a true wedge (a CDN/network hang where neither onload nor onerror arrives), so a
// slow-but-steady load on 3G / hospital WiFi keeps the overlay up and is NOT cut off at
// this value. Named at module scope (not buried in the render closure) so it can be tuned
// in one place.
const STALL_MS = 12000;

// Ceiling (ms) on how long the first paint will wait for the part-of-speech
// lookup that gives uncoloured buttons their Fitzgerald colours. The live board
// paints those colours too (board-detail.js#resolve_unknown_buttons), so waiting
// is what makes the preview match — but a wedged lookup must never withhold the
// preview, hence the race. In practice the single ≤100-word request settles well
// inside the symbol-image loads that already gate the loading overlay, and the
// word cache makes every board after the first free.
const POS_WAIT_MS = 1500;

/* Mirrors the folder test at the top of board-detail.js#pos_css_class
   (:3715-3721). That method is what `resolve_unknown_buttons` filters on, so a
   folder never reaches the part-of-speech lookup on the live board and never
   gains a `suggested_part_of_speech`. The preview had no such test and called
   `cached_pos_for_label` for every uncoloured button, so a board whose category
   folders are labelled "Food" / "People" / "Play" previewed them orange and
   green and then opened with them white. */
function is_folder_button(button) {
  if(!button) { return false; }
  var load_board = button.get ? button.get('load_board') : button.load_board;
  var link_disabled = button.get ? button.get('link_disabled') : button.link_disabled;
  var folder_action = button.get ? button.get('folderAction') : button.folderAction;
  return !!((load_board && !link_disabled) || folder_action);
}

export default Component.extend({
  appState: service('app-state'),
  persistence: service('persistence'),
  didInsertElement: function() {
    this.render_canvas();
    this._observe_container_resize();
  },
  /* Re-render when the preview's container box settles or changes size. The
     canvas derives its dimensions from the parent's MEASURED height
     (_modal_canvas_max_height = parent height − 96). On first paint that's fine —
     the user only selects a board after the page is laid out, so the parent is
     full-height. But `preview_board` is a singleton controller property that
     survives route exit, so on RE-ENTRY (search → home → back) the canvas
     inserts while the two-pane flex/grid heights are still transitional; the
     parent then measures short and the element gets capped to a wide-short strip
     with the board letterboxed tiny. A ResizeObserver on the PARENT re-renders
     once the real height lands (and also fixes canvas sizing on window resize).
     Observe the parent — NOT our own element, whose size _apply_modal_canvas_sizing
     mutates — and skip no-op callbacks so a settled layout can't loop. */
  _observe_container_resize: function() {
    var _this = this;
    var el = this.element;
    var parent = el && el.parentNode;
    if(!parent || typeof window === 'undefined' || !window.ResizeObserver || !parent.getBoundingClientRect) { return; }
    var seed = parent.getBoundingClientRect();
    this._maxParentW = seed.width;
    this._maxParentH = seed.height;
    var ro = new window.ResizeObserver(function() {
      if(_this.isDestroyed || _this.isDestroying) { return; }
      var r = parent.getBoundingClientRect();
      /* Re-render ONLY when the container grows past the largest size we've drawn
         for — this catches the route-re-entry "settle" (transitional-short → full
         height) without reacting to shrinks. Reacting to every delta risks a
         feedback loop: a re-render can flip the parent's overflow scrollbar or
         nudge the aspect-ratio'd element, changing the parent's measured box and
         re-triggering the observer indefinitely (the shrink/enlarge churn seen
         when the locale changed mid-preview). Growth is monotonic, so it always
         terminates. A genuine window-shrink just leaves the canvas CSS-scaled
         (marginally softer) rather than risk the loop. */
      if(r.width <= _this._maxParentW + 2 && r.height <= _this._maxParentH + 2) { return; }
      _this._maxParentW = Math.max(_this._maxParentW, r.width);
      _this._maxParentH = Math.max(_this._maxParentH, r.height);
      if(_this._resizeDebounce) { runCancel(_this._resizeDebounce); }
      _this._resizeDebounce = runLater(function() {
        _this._resizeDebounce = null;
        if(_this.isDestroyed || _this.isDestroying) { return; }
        _this.render_canvas();
      }, 60);
    });
    ro.observe(parent);
    this._resizeObserver = ro;
  },
  /* Size the modal canvas by the board's column:row ASPECT RATIO (square cells)
     rather than a fixed pixel height, so it scales UNIFORMLY when the available
     width changes — e.g. a modal scrollbar appearing on smaller screens. A fixed
     px height let the already-drawn square bitmap stretch into portrait cells when
     the width then shrank. width:100% + aspect-ratio keeps the dark canvas hugging
     the board AND keeps the cells square at every width. Capped at the column
     height (minus the actions row) so a tall board still fits — then it's
     height-limited and the draw loop centers it horizontally. */
  _apply_modal_canvas_sizing: function() {
    var el = this.element;
    if(!el) { return; }
    el.style.flex = '0 0 auto';
    el.style.minHeight = '0';
    el.style.width = '100%';
    var board = this.get('board');
    var cols = board && board.get && board.get('grid.columns');
    var rows = board && board.get && board.get('grid.rows');
    if(cols && rows) {
      el.style.aspectRatio = cols + ' / ' + rows;
      el.style.height = 'auto';
    } else {
      el.style.aspectRatio = '';
      el.style.height = '';
    }
    var max_h = this._modal_canvas_max_height();
    el.style.maxHeight = max_h ? (max_h + 'px') : '';
  },
  // Height cap for a tall board = the column height minus a FIXED band for the
  // actions row (~48px) + a breathing gap. We deliberately do NOT measure the
  // actions element: it's a sibling rendered right after this canvas, so at
  // didInsertElement time it often isn't laid out yet and reports 0.
  _modal_canvas_max_height: function() {
    var el = this.element;
    var col = el && el.parentNode;
    if(!col || !col.getBoundingClientRect) { return null; }
    var max_h = col.getBoundingClientRect().height - 96;
    return max_h > 0 ? max_h : null;
  },
  preview_style: computed('size', 'dark_mode', function() {
    /* In dark_mode, the canvas wrapper gets a deep-navy fill + matching
       border so the speak-mode appearance is reproduced inside the
       modal. Light mode keeps the original light-gray frame. */
    var dark = this.get('dark_mode');
    if(this.get('size') == 'modal') {
      // Aspect-ratio sizing keeps the cells square at any width (see
      // _apply_modal_canvas_sizing); the actions row is pinned below it
      // (margin-top:auto in CSS).
      this._apply_modal_canvas_sizing();
      if(dark) {
        return htmlSafe('width: 100%; height: 100%; border: 1px solid rgba(255,255,255,0.10); padding: 2px; border-radius: 8px; background: #0d2438;');
      }
      return htmlSafe('width: 100%; height: 100%; border: 1px solid #ccc; padding: 2px; border-radius: 5px;');
    } else {
      this.element.style.height = 'calc(100% - 55px)';
      return htmlSafe('width: 100%; height: 100%;');
    }
  }),
  /* Buttons whose colour the LIVE board derives from a part-of-speech lookup:
     no author colour, no stored/painted/suggested type, but a label to look up.
     board-detail.js#resolve_unknown_buttons selects exactly this set. */
  _labels_needing_pos: function(board) {
    if(!board || !board.translated_buttons) { return []; }
    var locale = this.get('locale');
    var res = [];
    (board.translated_buttons(locale, locale) || []).forEach(function(button) {
      if(!button || !button.label) { return; }
      /* Only `background_color` suppresses the POS fill, matching the live
         board. `--no-color` (app.scss:80413) sets `outline-color` and nothing
         else, so a button with an author-set BORDER colour still takes its
         part-of-speech background there — the preview's extra `border_color`
         test was painting those white. */
      if(button.background_color) { return; }
      if(button.part_of_speech || button.painted_part_of_speech || button.suggested_part_of_speech) { return; }
      // Folders never get a LOOKED-UP part of speech on the live board, so there
      // is nothing to look up here either — see is_folder_button.
      if(is_folder_button(button)) { return; }
      res.push(button.label);
    });
    return res;
  },
  /* Hold the first paint until the part-of-speech lookup lands, so uncoloured
     buttons come up in the same Fitzgerald colours the live board gives them
     instead of flashing neutral and recolouring. Bounded by POS_WAIT_MS: if the
     lookup is slower than that we draw without it and redraw when it arrives, so
     a wedged request can never withhold the preview. Attempted once per board —
     the word cache in utils/parts_of_speech.js makes repeat previews free. */
  render_canvas: function() {
    var _this = this;
    var board = this.get('board');
    // Keyed by board AND locale: switching the preview's locale swaps every
    // label, so the new labels need their own lookup pass.
    var pos_key = board && board.get && board.get('id');
    pos_key = pos_key && (pos_key + '::' + (this.get('locale') || ''));
    if(pos_key && this._pos_attempted_for !== pos_key) {
      var labels = this._labels_needing_pos(board);
      if(labels.length && words_needing_lookup(labels).length) {
        /* Latched HERE, not before `_labels_needing_pos` — the key is "we have
           started the lookup for this board+locale", so latching it earlier
           burned the attempt on a render where `board.buttons` had not arrived
           yet (models/board.js:539 returns [] until it has). Every later redraw
           then painted from whatever the session cache happened to hold while
           the live board resolved the full set. */
        this._pos_attempted_for = pos_key;
        var persistenceSvc = this.persistence;
        /* Render generation. The timeout and the lookup race each other, and a
           lookup that settles AFTER POS_WAIT_MS used to call draw() a second
           time — two independent pending/emitted/stall_timer closures against
           one <canvas>, where the first could reach onCanvasReady and lift the
           modal's loading overlay onto a half-drawn board while the second was
           still loading images. Whichever fires first claims the generation;
           the loser becomes a no-op. */
        this._pos_render_generation = (this._pos_render_generation || 0) + 1;
        var generation = this._pos_render_generation;
        var draw = function() {
          if(_this.isDestroyed || _this.isDestroying) { return; }
          if(_this._pos_render_drawn === generation) { return; }
          _this._pos_render_drawn = generation;
          _this._draw_canvas();
        };
        var clear_wait = function() {
          if(_this._posWaitTimer) { runCancel(_this._posWaitTimer); _this._posWaitTimer = null; }
        };
        resolve_labels_pos(labels, function(url, opts) { return persistenceSvc.ajax(url, opts); }, RSVP)
          .then(function() { clear_wait(); draw(); }, function() { clear_wait(); draw(); });
        this._posWaitTimer = runLater(function() {
          _this._posWaitTimer = null;
          draw();
        }, POS_WAIT_MS);
        /* Size the element now even though nothing is painted yet: the canvas
           box is what the modal lays out around, and leaving it at the default
           800x600 until the lookup lands would reflow the modal when it does. */
        if(this.get('size') == 'modal' && this.element) { this._apply_modal_canvas_sizing(); }
        return;
      }
    }
    this._draw_canvas();
  },
  _draw_canvas: function() {
    if(this.get('size') == 'modal') {
      // Aspect-ratio sizing keeps the cells square at any width and lets the canvas
      // scale uniformly when the width changes (see _apply_modal_canvas_sizing).
      this._apply_modal_canvas_sizing();
    } else if(this.get('show_links')) {
      this.element.style.height = 'calc(100% - 70px)';
    } else {
      this.element.style.height = 'calc(100% - 55px)';
    }
    var _this = this; // Capture _this for closure access
    /* Drop any prior render's stall watchdog before starting a fresh render —
       the observer can re-render (debounced) when board.id/image_urls/locale
       settle, and a stale watchdog from the previous closure must not fire
       onCanvasReady against this render. */
    if (_this._previewStallTimer) { runCancel(_this._previewStallTimer); _this._previewStallTimer = null; }
    var persistence = _this.persistence;
    var board = this.get('board');
    var level = this.get('current_level') || this.get('base_level') || 10;
    var show_links = this.get('show_links');
    var preferred_symbols = this.get('preferred_symbols') || (this.appState && (this.appState.get('referenced_user.preferences.preferred_symbols') || this.appState.get('currentUser.preferences.preferred_symbols'))) || 'original';
    // Honor the user's button FONT preference instead of always drawing Arial —
    // resolves preferences.device.button_style → font family (same families as
    // controllers/user/board-detail.js#button_font_style). Used for all label text
    // below. Applies to the board-preview modal AND the Find Boards preview.
    var _bstyle = (this.appState && (this.appState.get('referenced_user.preferences.device.button_style') || this.appState.get('currentUser.preferences.device.button_style'))) || 'default';
    _bstyle = String(_bstyle).replace(/_(caps|small)$/, '');
    var _font_families = {
      comic_sans: '"Comic Sans MS", cursive',
      open_dyslexic: 'OpenDyslexic, sans-serif',
      architects_daughter: 'ArchitectsDaughter, cursive',
      helvetica: 'Helvetica, "Helvetica Neue", Arial, sans-serif',
      verdana: 'Verdana, Geneva, sans-serif'
    };
    var label_font = _font_families[_bstyle] || 'Arial, sans-serif';
    // Fitzgerald / keyed-colors palette (same source board-detail speak mode uses)
    // so buttons without an author-set color get their part-of-speech color below.
    var fitz_colors = LingoLinq.board_detail_keyed_colors || LingoLinq.keyed_colors;
    // Adjust a BORDER color: de-saturate 20% AND lighten 15%, UNLESS its hue is
    // yellow→green (~40–170°), which is left unchanged. Handles #rgb, #rrggbb, rgb().
    var desat_border = function(color) {
      if(!color || typeof color !== 'string') { return color; }
      var r, g, b, m;
      if((m = color.match(/^#([0-9a-fA-F]{3})$/))) { r = parseInt(m[1][0] + m[1][0], 16); g = parseInt(m[1][1] + m[1][1], 16); b = parseInt(m[1][2] + m[1][2], 16); }
      else if((m = color.match(/^#([0-9a-fA-F]{6})$/))) { r = parseInt(m[1].slice(0, 2), 16); g = parseInt(m[1].slice(2, 4), 16); b = parseInt(m[1].slice(4, 6), 16); }
      else if((m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/))) { r = +m[1]; g = +m[2]; b = +m[3]; }
      else { return color; }
      var rr = r / 255, gg = g / 255, bb = b / 255, max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb), l = (max + min) / 2, h = 0, s = 0;
      if(max !== min) {
        var d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if(max === rr) { h = (gg - bb) / d + (gg < bb ? 6 : 0); } else if(max === gg) { h = (bb - rr) / d + 2; } else { h = (rr - gg) / d + 4; }
        h *= 60;
      }
      if(s < 0.15 && l >= 0.7) { return color; } // LIGHT gray only — leave unchanged (dark gray still gets adjusted)
      if(h >= 40 && h <= 170) { return color; }  // yellow through green — leave unchanged
      s = Math.max(0, s * 0.8);      // 20% less saturated
      l = Math.min(1, l + 0.15);     // 15% lighter
      var hue2rgb = function(p, q, t) { if(t < 0) t += 1; if(t > 1) t -= 1; if(t < 1 / 6) return p + (q - p) * 6 * t; if(t < 1 / 2) return q; if(t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
      var q2 = l < 0.5 ? l * (1 + s) : l + s - l * s, p2 = 2 * l - q2;
      var nr = Math.round(hue2rgb(p2, q2, h / 360 + 1 / 3) * 255), ng = Math.round(hue2rgb(p2, q2, h / 360) * 255), nb = Math.round(hue2rgb(p2, q2, h / 360 - 1 / 3) * 255);
      return 'rgb(' + nr + ', ' + ng + ', ' + nb + ')';
    };
    /* Track image-load completion for the modal overlay. Each per-cell
       image draw increments `pending`; each onload/onerror decrements
       it. After the synchronous render loop sets `loop_done = true`,
       `maybe_emit_canvas_ready` fires `onCanvasReady` as soon as
       `pending` reaches zero (or immediately if there were no images
       to load at all). */
    var pending = 0;
    var loop_done = false;
    var emitted = false;
    /* Image-load progress surfaced to the loading overlay via onCanvasProgress
       so the spinner can show "N / total" instead of an opaque wait — important
       on slow/old devices where the (correct) wait-for-all-images behavior can
       otherwise look like a hang. total_images counts cells that start an image
       load; loaded_images counts the ones that have settled (onload OR onerror). */
    var total_images = 0;
    var loaded_images = 0;
    /* Set inside the main draw block (closure over context + palette).
       Called by maybe_emit_canvas_ready as the FINAL drawing operation,
       AFTER all per-cell drawImage calls have settled, so nothing can
       overdraw the badge. Null when the canvas didn't draw (e.g.
       board.id missing). */
    var draw_badge_if_offline = null;
    var stall_timer = null;
    /* Fire onCanvasReady exactly once, painting the offline badge LAST so no
       late-loading cell image can overdraw it (only when persistence reports
       offline at this exact moment — the badge captures "was offline when the
       preview finished loading"). Shared by the normal "all images settled"
       path and the stall watchdog, and always clears the watchdog so it can't
       fire after we've already emitted. */
    var do_emit = function() {
      if(emitted) { return; }
      if(draw_badge_if_offline && persistence && persistence.get('online') === false) {
        draw_badge_if_offline();
      }
      if(stall_timer) { runCancel(stall_timer); stall_timer = null; _this._previewStallTimer = null; }
      emitted = true;
      var cb = _this.get('onCanvasReady');
      if(cb && typeof cb === 'function') { cb(); }
    };
    var maybe_emit_canvas_ready = function() {
      if(emitted) { return; }
      if(!loop_done) { return; }
      if(pending > 0) { return; }
      do_emit();
    };
    /* No-progress stall watchdog. The loading overlay (board-preview-overlay)
       stays up until the canvas reports onCanvasReady, so we must NOT report
       ready while images are still legitimately loading — on a slow/old device
       that would lift the overlay onto a half-drawn board. Instead of a fixed
       deadline from render start, we only bail when image loading makes ZERO
       progress for STALL_MS: every settled image (onload/onerror) re-arms the
       timer via mark_image_done, so a slow-but-steady load keeps the overlay up
       until the last image lands and pending hits 0 (the normal emit path). The
       watchdog fires only on a true wedge — a CDN/network hang where neither
       onload nor onerror ever arrives — guaranteeing the overlay can never stick
       forever. Re-arm (cancel + reschedule) implements the "no progress for
       STALL_MS" semantic without any wall-clock math. STALL_MS is the module-scope
       named constant defined at the top of this file (tunable in one place). */
    var arm_stall_watchdog = function() {
      if(emitted) { return; }
      if(stall_timer) { runCancel(stall_timer); }
      // Adversarial-review false positive ("isDestroyed guard fires too late, could call
      // do_emit -> onCanvasReady on a stale parent"): two layers prevent that. (1) The
      // timer handle is stored on `_this._previewStallTimer` and runCancel()'d in
      // willDestroyElement (see below), so on a normal teardown the callback never runs.
      // (2) Even if it did fire, the FIRST statement here is the isDestroyed/isDestroying
      // check, which returns BEFORE do_emit — so onCanvasReady is never invoked once the
      // component is tearing down. The guard is the entry condition, not "too late".
      stall_timer = _this._previewStallTimer = runLater(function() {
        stall_timer = null;
        _this._previewStallTimer = null;
        if(_this.isDestroyed || _this.isDestroying) { return; }
        do_emit();
      }, STALL_MS);
    };
    /* Push the current image-load tally to the overlay. Called once up-front
       with (0, total) so the spinner can show the total immediately, then after
       every settled image. No-op when the parent didn't wire a handler. */
    var emit_progress = function() {
      var cb = _this.get('onCanvasProgress');
      if(cb && typeof cb === 'function') { cb(loaded_images, total_images); }
    };
    var mark_image_done = function() {
      if(pending > 0) { pending--; }
      if(loaded_images < total_images) { loaded_images++; }
      emit_progress();
      maybe_emit_canvas_ready();
      // An image just settled — that's progress. Reset the no-progress
      // watchdog so loading is judged stalled only by a genuine gap with no
      // image arriving, not by overall slowness. (do_emit clears it once
      // pending hits 0, so this is a no-op on the final image.) Skip during
      // teardown — image callbacks can route here after destroy, and we must
      // not schedule a fresh timer then.
      if(!emitted && !_this.isDestroyed && !_this.isDestroying) { arm_stall_watchdog(); }
    };
    /* Pick a label color (dark or light) that contrasts with the
       button's actual fill. Author-set background colors override the
       dark/light palette default, so a hard-coded label like
       `palette.label = #f1f4f8` reads as invisible white on a pastel
       yellow/green/blue. Compute relative luminance from the fill and
       flip the label to charcoal on light fills, off-white on dark
       fills. Handles hex (#abc, #aabbcc) and rgb/rgba. */
    var contrast_label = function(fill, fallback) {
      if(!fill) { return fallback; }
      var r, g, b, a = 1;
      var m = String(fill).trim().match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
      if(m) {
        r = parseInt(m[1], 10);
        g = parseInt(m[2], 10);
        b = parseInt(m[3], 10);
        if(m[4] != null) { a = parseFloat(m[4]); }
      } else if(/^#[0-9a-f]{3,8}$/i.test(fill)) {
        var hex = fill.replace('#', '');
        if(hex.length === 3) { hex = hex.split('').map(function(c) { return c + c; }).join(''); }
        r = parseInt(hex.slice(0, 2), 16);
        g = parseInt(hex.slice(2, 4), 16);
        b = parseInt(hex.slice(4, 6), 16);
      } else {
        return fallback;
      }
      /* Translucent fills blend with the canvas background — for the
         dark-mode background fill at #0d2438 (very dark), a low-alpha
         author color reads as mostly dark, so the label should stay
         light. Approximate the blended luminance. */
      if(a < 1 && dark) {
        var bgR = 0x0d, bgG = 0x24, bgB = 0x38;
        r = Math.round(r * a + bgR * (1 - a));
        g = Math.round(g * a + bgG * (1 - a));
        b = Math.round(b * a + bgB * (1 - a));
      }
      /* Standard relative-luminance approximation (Rec. 601 weights).
         Threshold 140/255 ≈ 0.55 — comfortable middle-ground for AAC
         pastel palettes. */
      var lum = (0.299 * r + 0.587 * g + 0.114 * b);
      return lum > 140 ? '#1a1a1a' : '#f1f4f8';
    };
    /* Dark-mode palette mirrors the speak-mode board-detail surface:
       deep navy field, lighter-on-navy borders, off-white labels.
       When dark_mode is false the original light palette is used. */
    var dark = this.get('dark_mode');
    var palette = dark ? {
      bg: '#0d2438',
      hidden_stroke: 'rgba(255,255,255,0.18)',
      hidden_fill: 'rgba(255,255,255,0.05)',
      /* An author-uncoloured card on the live dark board is near-white with a
         faint white outline — `.md-board-detail--dark .md-…--no-color`
         (background-color: rgba(255,255,255,0.92), app.scss:81998) and
         `.md-board-detail--dark .md-…-symbol-card` (outline-color:
         rgba(255,255,255,0.10), app.scss:81995). Painting these navy is what made
         the preview look nothing like the board. contrast_label picks the
         charcoal label over this fill on its own. */
      stroke: 'rgba(255,255,255,0.10)',
      fill: 'rgba(255,255,255,0.92)',
      link_fallback_stroke: 'rgba(255,255,255,0.10)',
      link_fallback_fill: 'rgba(255,255,255,0.92)',
      label: '#f1f4f8',
      /* Offline badge + missing-image fallback colors — translated from
         the "modern pill" CSS pattern (border-radius:999px, glass-veil
         gradient, subtle border, three-tier shadow) into canvas-API
         operations. Atmospheric-depth recipe from LEARNINGS.md:
         hairline border + glass veil + shadow stack + inset top
         highlight. Dark-mode values keep the badge readable on the
         deep-navy speak-mode surface (#0d2438). */
      badge_fill_top: 'rgba(255,255,255,0.18)',
      badge_fill_bottom: 'rgba(255,255,255,0.10)',
      badge_border: 'rgba(255,255,255,0.18)',
      badge_inset_top: 'rgba(255,255,255,0.28)',
      badge_text: 'rgba(255,255,255,0.92)',
      badge_shadow: 'rgba(0,0,0,0.40)',
      missing_image_fill: 'rgba(255,255,255,0.06)',
      missing_image_stroke: 'rgba(255,255,255,0.14)'
    } : {
      bg: null,
      hidden_stroke: 'rgba(20,40,68,0.10)',
      hidden_fill: 'rgba(255,255,255,0.6)',
      /* The live board's `--default` card: white on $brand-stone-300
         (#E0DCD6) — app.scss:76916, _variables.scss:78. */
      stroke: '#E0DCD6',
      fill: '#FFFFFF',
      link_fallback_stroke: '#E0DCD6',
      link_fallback_fill: '#FFFFFF',
      label: '#000',
      badge_fill_top: 'rgba(255,255,255,0.96)',
      badge_fill_bottom: 'rgba(241,244,248,0.92)',
      badge_border: 'rgba(20,40,68,0.10)',
      badge_inset_top: 'rgba(255,255,255,0.90)',
      badge_text: 'rgba(20,30,45,0.86)',
      badge_shadow: 'rgba(20,40,68,0.18)',
      missing_image_fill: 'rgba(20,40,68,0.04)',
      missing_image_stroke: 'rgba(20,40,68,0.10)'
    };

    /* Trace a rounded-rectangle path. Mirrors `border-radius: 999px`
       when r >= h/2 (fully rounded "pill" shape); smaller r values
       give corner-rounded rectangles. Caller is responsible for
       beginPath/fill/stroke around this. Path-based (not roundRect)
       so we don't depend on Chrome 99+ / Safari 16+ — older WebViews
       (Cordova installed app) need this. */
    var trace_rounded_rect = function(ctx, rx, ry, rw, rh, r) {
      r = Math.min(r, rw / 2, rh / 2);
      ctx.beginPath();
      ctx.moveTo(rx + r, ry);
      ctx.lineTo(rx + rw - r, ry);
      ctx.arc(rx + rw - r, ry + r, r, -Math.PI / 2, 0);
      ctx.lineTo(rx + rw, ry + rh - r);
      ctx.arc(rx + rw - r, ry + rh - r, r, 0, Math.PI / 2);
      ctx.lineTo(rx + r, ry + rh);
      ctx.arc(rx + r, ry + rh - r, r, Math.PI / 2, Math.PI);
      ctx.lineTo(rx, ry + r);
      ctx.arc(rx + r, ry + r, r, Math.PI, 1.5 * Math.PI);
      ctx.closePath();
    };

    if(board && this.get('board.id')) {
      var canvas = this.element.getElementsByTagName('canvas')[0];
      if(canvas) {
        var context = canvas.getContext('2d');
        var rect = canvas.getBoundingClientRect();

        var width = rect.width * 2;
        canvas.setAttribute('width', width);
        var height = rect.height * 2;
        canvas.setAttribute('height', height);
        var pad = width / 120;

        context.save();
        context.clearRect(0, 0, width, height);
        /* Paint the dark-mode background fill across the whole canvas
           before drawing any buttons so the inter-button gutters read
           as the speak-mode dark surface. */
        if(dark) {
          context.fillStyle = palette.bg;
          context.fillRect(0, 0, width, height);
        }

        var rows = board.get('grid.rows');
        var columns = board.get('grid.columns');
        var buttons = {};
        var locale = this.get('locale');
        (board.translated_buttons(locale, locale) || []).forEach(function(button) {
          buttons[button.id] = button;
        });
        var button_width = width / columns;
        var button_height = height / rows;
        // Keep buttons square — never stretch a cell beyond a square. Use the
        // smaller of the two per-axis sizes for BOTH dimensions and center the
        // grid in the leftover space (letterbox), so a tall modal canvas no
        // longer produces tall rectangles.
        var cell = Math.min(button_width, button_height);
        button_width = cell;
        button_height = cell;
        var offset_x = (width - (cell * columns)) / 2;
        var offset_y = (height - (cell * rows)) / 2;
        var radius = button_width / 9;
        var border_size = pad / 2.5;
        if(this.get('size') == 'selection') {
          border_size = pad / 4;
        }
        if(rows > 4 || columns > 8) {
          pad = pad / 2;
        }
        var inner_height = (button_height - pad - pad - border_size - border_size);
        var text_height = inner_height * 0.25;
        text_height = Math.min(text_height, height / 20);
        var image_height = inner_height - text_height;
        var image_width = button_width - pad - pad - border_size - border_size;
        context.font = text_height + "px " + label_font;
        context.textAlign = 'center';

        /* Modern "Offline" pill drawn in the top-right corner of the
           canvas when `persistence.online === false` at canvas-ready
           time. Visual recipe translates the app's CSS pill convention
           (border-radius:999px, glass-veil gradient, hairline border,
           inset top-edge highlight, three-tier drop shadow — see
           LEARNINGS atmospheric-depth pattern) into canvas-API
           operations. Drawn after all per-cell drawImage calls have
           settled (see maybe_emit_canvas_ready) so no cell can
           overdraw the badge. Geometry scales with canvas width so
           the badge stays legible at every preview size from the
           selection-tool's tiny preview to the full modal. */
        var draw_offline_badge = function() {
          var label_text = i18n.t('offline', "Offline");
          // Badge height ~ canvas-width / 28 ≈ a 28-32px CSS pill on
          // an 800-1200px modal preview. Floor at 36 canvas px so
          // tiny previews still get a legible badge.
          var badge_h = Math.max(36, Math.floor(width / 28));
          var font_px = Math.floor(badge_h * 0.48);
          var inner_pad_x = Math.floor(badge_h * 0.55);
          context.save();
          // Bold + open letter-spacing matches the .md-hero--setup pill
          // and other modern pills throughout app.scss.
          context.font = '600 ' + font_px + 'px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';
          var text_w = context.measureText(label_text).width;
          var badge_w = inner_pad_x + text_w + inner_pad_x;
          // Position: inset by `pad` from top-right; clamp so badge
          // never overhangs the canvas edge on tiny previews.
          var inset = Math.max(pad, badge_h * 0.35);
          var badge_x = Math.max(inset, width - badge_w - inset);
          var badge_y = inset;
          var radius = badge_h / 2;  // full pill

          // Three-tier shadow: close + mid implicit via blur; broad
          // ambient haze via the offsetY+blur combo. Single shadow
          // pass on the fill stage — canvas only allows one shadow
          // per drawing op, so we approximate the CSS stack with the
          // broadest tier (the "fade into the canvas" haze).
          context.shadowOffsetX = 0;
          context.shadowOffsetY = badge_h * 0.18;
          context.shadowBlur = badge_h * 0.75;
          context.shadowColor = palette.badge_shadow;

          // Pill background with glass-veil gradient (top brighter,
          // bottom slightly darker) — same direction as the CSS
          // `linear-gradient(180deg, …)` glass veil from LEARNINGS.
          trace_rounded_rect(context, badge_x, badge_y, badge_w, badge_h, radius);
          var grad = context.createLinearGradient(badge_x, badge_y, badge_x, badge_y + badge_h);
          grad.addColorStop(0, palette.badge_fill_top);
          grad.addColorStop(1, palette.badge_fill_bottom);
          context.fillStyle = grad;
          context.fill();

          // Reset shadow for the stroke + content layers.
          context.shadowColor = 'rgba(0,0,0,0)';
          context.shadowBlur = 0;
          context.shadowOffsetY = 0;

          // Hairline border (.04–.08 alpha range from the depth pattern).
          context.lineWidth = 2;  // 1 CSS px at 2x DPI
          context.strokeStyle = palette.badge_border;
          context.stroke();

          // Inset top-edge highlight — a faint bright stroke 1 CSS px
          // below the top edge, hugging the pill curvature. Pairs with
          // the outer shadow to create directional lighting (bright
          // above, dark below) per the depth recipe.
          context.beginPath();
          // Arc along the top half of the pill, slightly inset so it
          // reads as a highlight inside the border rather than on it.
          context.arc(badge_x + radius, badge_y + radius, radius - 2, Math.PI, 1.5 * Math.PI);
          context.lineTo(badge_x + badge_w - radius, badge_y + 2);
          context.arc(badge_x + badge_w - radius, badge_y + radius, radius - 2, 1.5 * Math.PI, 2 * Math.PI);
          context.lineWidth = 2;
          context.strokeStyle = palette.badge_inset_top;
          context.stroke();

          // "Offline" label, centered vertically inside the pill.
          context.fillStyle = palette.badge_text;
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.fillText(label_text, badge_x + (badge_w / 2), badge_y + (badge_h / 2));

          context.restore();
        };

        /* Subtle placeholder drawn into a cell's image area when its
           symbol URL fails to load (cache-miss + offline, dead CDN
           link, etc.). Without this the cell renders as empty white
           space — indistinguishable from "still loading" or "broken
           board." The placeholder is a faint rounded rect plus a
           small broken-image glyph (rectangle + diagonal) centered
           inside, so the user can SEE that an image was expected
           there but couldn't be loaded. The badge (above) tells them
           WHY when the cause is global offline; this tells them WHICH
           individual cells were affected. Per pre-merge audit §2.5. */
        var draw_image_fallback = function(ix, iy, iw, ih) {
          if (iw <= 0 || ih <= 0) { return; }
          context.save();
          // Tile the cell's image area with a subtle rounded fill.
          var r = Math.min(iw, ih) * 0.12;
          trace_rounded_rect(context, ix, iy, iw, ih, r);
          context.fillStyle = palette.missing_image_fill;
          context.fill();
          // Small broken-image glyph: a rectangle inset by ~25% with
          // a single diagonal stroke. Reads as "image not loaded"
          // without the visual noise of a "?" or full broken-image
          // icon. Scales down to invisible on very small cells, which
          // is the correct behavior — at selection-tool preview size
          // the cell is too small for any glyph to read.
          var glyph_pad = Math.max(2, Math.min(iw, ih) * 0.22);
          var gx = ix + glyph_pad;
          var gy = iy + glyph_pad;
          var gw = iw - (2 * glyph_pad);
          var gh = ih - (2 * glyph_pad);
          if (gw > 8 && gh > 8) {
            context.lineWidth = Math.max(1.5, Math.min(iw, ih) * 0.025);
            context.strokeStyle = palette.missing_image_stroke;
            context.lineCap = 'round';
            context.lineJoin = 'round';
            trace_rounded_rect(context, gx, gy, gw, gh, Math.min(gw, gh) * 0.10);
            context.stroke();
            context.beginPath();
            context.moveTo(gx, gy + gh);
            context.lineTo(gx + gw, gy);
            context.stroke();
          }
          context.restore();
        };

        // Expose the badge drawer to the outer-scope
        // maybe_emit_canvas_ready closure so it can paint the badge
        // as the FINAL draw operation, AFTER every per-cell drawImage
        // has settled. Assigned after the var declaration above so
        // the closure captures the defined function, not undefined.
        draw_badge_if_offline = draw_offline_badge;

        var variant_urls = board.variant_image_urls(this.appState.get('currentUser.preferences.skin'));
        /* Synchronously resolve a remote image URL through the locally
           synced URL cache, with the same fallback ladder
           board-detail-grid uses for its <img src=…> rendering
           (board-detail.js#_resolve_cached_image_url). Returning the
           raw remote URL when no cache hit is found is the key trick:
           `new Image().src = remote_url` then does the HTTP fetch
           directly, which works regardless of whether the persistence
           subsystem has finished priming. */
        var resolve_url_sync = function(remote_url) {
          if (!remote_url) { return null; }
          var url_cache = persistence.url_cache;
          var url_uncache = persistence.url_uncache;
          var try_url = function(u) {
            if (!u) { return null; }
            if (url_uncache && url_uncache[u]) { return null; }
            var cached = url_cache && url_cache[u];
            if (cached && cached !== false) { return cached; }
            return null;
          };
          var cached = try_url(remote_url);
          if (cached) { return cached; }
          var unvarianted = remote_url.replace(/\.variant-.+\.(png|svg)$/, '');
          if (unvarianted !== remote_url && !LingoLinq.Board.is_skin_tone_variant_url(remote_url)) {
            cached = try_url(unvarianted);
            if (cached) { return cached; }
          }
          var alt_url = null;
          if (remote_url.match(/^https:\/\/s3\.amazonaws\.com\/opensymbols\//)) {
            alt_url = remote_url.replace(/^https:\/\/s3\.amazonaws\.com\/opensymbols\//, 'https://d18vdu4p71yql0.cloudfront.net/');
          } else if (remote_url.match(/^https:\/\/opensymbols\.s3\.amazonaws\.com\//)) {
            alt_url = remote_url.replace(/^https:\/\/opensymbols\.s3\.amazonaws\.com\//, 'https://d18vdu4p71yql0.cloudfront.net/');
          }
          if (alt_url) {
            cached = try_url(alt_url);
            if (cached) { return cached; }
          }
          return remote_url;
        };
        var handle_button = function(button_id) {
            var button = $.extend({}, buttons[button_id] || {});
            if(!button_id || !buttons[button_id]) {
              button.hidden = true;
            }
            if(button) {
              /* Apply level_modifications ONLY when a sub-10 level is
                 in effect. Mirrors board-detail.js#_make_btn (the
                 `if(level && level < 10)` gate at line 921). At the
                 default level=10 the level filter is off — the raw
                 `hidden` flag from the button data stays intact, and
                 buttons the author tagged with `level_modifications.1
                 .hidden=true` (a common "hidden by default until
                 promoted" pattern) still render normally.

                 Without this gate the loop walks 1→10 cumulatively
                 and any sub-level that sets hidden=true latches it on
                 for the rest of the loop, which previously produced
                 the bug where Vocal Flair 84 — Categorías Comida
                 rendered every cell as empty in the preview while
                 board-detail (with the same default level) showed the
                 full populated grid. */
              if(level && level < 10 && button.level_modifications) {
                if(button.level_modifications.pre) {
                  for(var key in button.level_modifications.pre) {
                    button[key] = button.level_modifications.pre[key];
                  }
                }
                for(var bdx = 1; bdx <= level; bdx++) {
                  if(button.level_modifications[bdx]) {
                    for(var key in button.level_modifications[bdx]) {
                      button[key] = button.level_modifications[bdx][key];
                    }
                  }
                }
                if(button.level_modifications.override) {
                  for(var key in button.level_modifications.override) {
                    button[key] = button.level_modifications.override[key];
                  }
                }
              }

              var show_always = true;
              if(!button.hidden || show_always) {
                var x = offset_x + (button_width * jdx);
                var y = offset_y + (button_height * idx);
                var draw_button = function(button, x, y, fill) {
                  context.beginPath();
                  if(button.hidden) {
                    context.strokeStyle = palette.hidden_stroke;
                    context.fillStyle = palette.hidden_fill;
                    context.lineWidth = border_size / 2;
                  } else {
                    /* Color priority — mirrors board-detail-grid.hbs:53/58 exactly:
                       1) author-set colors win (there: the inline style);
                       2) else the Fitzgerald color for the button's part of speech,
                          read from the SAME three fields the live board's
                          `md-board-detail-symbol-card--<pos>` class reads —
                          part_of_speech || painted_part_of_speech ||
                          suggested_part_of_speech — plus the session POS cache,
                          which is where `suggested_part_of_speech` comes from on
                          the live board (board-detail.js#resolve_unknown_buttons);
                       3) else the neutral palette (the `--default` card).
                       In DARK mode step 2 is skipped: the live board's
                       `.md-board-detail--dark .md-…--no-color` rule (app.scss:81998)
                       out-specifies every POS rule, so an author-uncoloured button
                       is near-white there regardless of its part of speech. */
                    var pos_fill = null, pos_border = null;
                    if(!button.background_color && fitz_colors && !dark) {
                      /* The looked-up type is the ONLY part folders are excluded
                         from: `resolve_unknown_buttons` filters on
                         `pos_css_class(btn) === 'default'` and that returns
                         'folder' first (board-detail.js:3715-3721), so the live
                         board never invents a colour for a category folder. An
                         AUTHORED part_of_speech on a folder still paints there —
                         the template reads the raw fields (board-detail-grid.hbs:53)
                         — so it must still paint here. */
                      var pos_type = button.part_of_speech || button.painted_part_of_speech ||
                                     button.suggested_part_of_speech ||
                                     ((button.label && !is_folder_button(button)) ? cached_pos_for_label(button.label) : null);
                      var pos_c = pos_type && color_for_type(pos_type, fitz_colors);
                      if(pos_c) { pos_fill = pos_c.fill; pos_border = pos_c.border; }
                    }
                    context.strokeStyle = desat_border(button.border_color || pos_border || (show_links ? palette.link_fallback_stroke : palette.stroke));
                    context.fillStyle = button.background_color || pos_fill || (show_links ? palette.link_fallback_fill : palette.fill);
                    context.lineWidth = border_size;
                  }

                  context.moveTo(x + pad + radius, y + pad);
                  context.lineTo(x + button_width - pad - radius, y + pad);
                  context.arcTo(x + button_width - pad, y + pad, x + button_width - pad, y + pad + radius, radius);
                  context.lineTo(x + button_width - pad, y + pad + radius, x + button_width - pad, y + button_height - pad - radius);
                  context.arcTo(x + button_width - pad, y + button_height - pad, x + button_width - pad - radius, y + button_height - pad, radius);
                  context.lineTo(x + pad + radius, y + button_height - pad);
                  context.arcTo(x + pad, y + button_height - pad, x + pad, y + button_height - pad - radius, radius);
                  context.lineTo(x + pad, y + pad + radius);
                  context.arcTo(x + pad, y + pad, x + pad + radius, y + pad, radius);

                  if(fill) {
                    context.fill();
                  }
                  context.stroke();
                  context.save();

                  if(!button.hidden && show_links) {
                    context.clip();
                    if(button.load_board || button.url || button.apps || button.integration) {
                      if(!button.link_disabled) {
                        context.beginPath();
                        context.arc(x + button_width - pad, y + pad, button_width / 8, 0, 2*Math.PI);
                        context.fillStyle = context.strokeStyle;
                        context.fill();
                      }
                    }
                    if(button.label) {
                      /* Per-button label color — picks dark text on a
                         light fill and light text on a dark fill.
                         Critical for AAC boards whose author colors
                         (Fitzgerald / Goossens palette) are pastel
                         yellow/green/blue/pink; the dark-mode default
                         `palette.label` would otherwise paint
                         off-white text on those pastels and read as
                         invisible. */
                      var fill_for_label = button.background_color || (show_links ? palette.link_fallback_fill : palette.fill);
                      context.fillStyle = contrast_label(fill_for_label, palette.label);
                      /* Shrink the label so it fits the button's inner width
                         instead of overflowing and clipping (e.g. "question" ->
                         "uestion"). Start at text_height and scale down to fit,
                         floored at 50% so it never becomes unreadable. */
                      var label_avail = button_width - pad - pad - border_size - border_size;
                      context.font = text_height + "px " + label_font;
                      var label_w = context.measureText(button.label).width;
                      if(label_w > label_avail && label_w > 0) {
                        var fit_size = Math.max(text_height * (label_avail / label_w), text_height * 0.5);
                        context.font = fit_size + "px " + label_font;
                      }
                      context.fillText(button.label, x + (button_width / 2), y + pad + (text_height * 0.85));
                    }
                  }
                  context.restore();
                };
                draw_button(button, x, y, true);

                if(show_links && !button.hidden && button.image_id && board.get('image_urls') && board.get('image_urls')[button.image_id]) {
                  var orig_url = variant_urls[button.image_id];
                  var url = variant_urls[button.image_id + "-" + preferred_symbols] || orig_url;
                  /* Synchronous URL resolution — mirrors board-detail's
                     `_resolve_cached_image_url`. Tries `persistence.url_cache`
                     for a locally-synced data URI (and a couple of
                     known URL-variant fallbacks), then falls back to the
                     raw remote URL and lets the browser HTTP-fetch it
                     via `new Image().src`.

                     Critical: we deliberately do NOT call
                     `persistence.find_url(url)` here. That function
                     reschedules itself every 500ms while
                     `persistence.primed` is false, with no escape if
                     priming never completes — leaving every image
                     promise wedged indefinitely. board-detail-grid
                     dodges this entirely with the same sync-cache +
                     remote-URL-fallback strategy, and that path renders
                     S3 symbol URLs reliably. */
                  var resolved_url = resolve_url_sync(url) || url;
                  pending++;
                  total_images++;
                  (function(button, x, y, resolved_url, component) {
                    var cell_done = false;
                    var cell_finish = function() {
                      if(cell_done) { return; }
                      cell_done = true;
                      mark_image_done();
                    };
                    if (component.isDestroyed || component.isDestroying) { cell_finish(); return; }
                    var img = new Image();
                    var button_ratio = image_width / image_height;
                    img.onload = function() {
                      if (component.isDestroyed || component.isDestroying) { cell_finish(); return; }
                      var image_ratio = img.width / img.height;
                      var iw = image_width;
                      var ih = image_height;
                      var image_x = x + border_size + pad;
                      var image_y = y + border_size + pad + text_height;
                      if(image_ratio > button_ratio) {
                        // wider than the space
                        var diff = (1 - (button_ratio / image_ratio)) * ih;
                        image_y += diff / 2;
                        ih -= diff;
                      } else if(image_ratio < button_ratio) {
                        // taller than the space
                        var diff = (1 - (image_ratio / button_ratio)) * iw;
                        image_x += diff / 2;
                        iw -= diff;
                      }
                      context.drawImage(img, image_x, image_y, iw, ih);
                      cell_finish();
                    };
                    // Per-cell fallback when the symbol URL won't load
                    // (offline + cache-miss, dead CDN link, malformed
                    // URL). Without this the cell shows the label but
                    // an empty white image area — visually indistinct
                    // from "still loading" or "broken board." Draw a
                    // subtle placeholder + broken-image glyph instead.
                    // Per pre-merge audit §2.5 (offline / empty-state
                    // coverage) and Scot #5 review.
                    img.onerror = function() {
                      if (component.isDestroyed || component.isDestroying) { cell_finish(); return; }
                      var fb_x = x + border_size + pad;
                      var fb_y = y + border_size + pad + text_height;
                      draw_image_fallback(fb_x, fb_y, image_width, image_height);
                      cell_finish();
                    };
                    img.src = resolved_url;
                  })(button, x, y, resolved_url, _this);
                }
              }
            }
        };
        for(var idx = 0; idx < rows; idx++) {
          for(var jdx = 0; jdx < columns; jdx++) {
            var button_id = ((board.get('grid.order') || [])[idx] || [])[jdx];
            handle_button(button_id);
          }
        }
        /* Loop finished — flip the gate. The actual emit is deferred
           to the next runloop tick so that when `pending` is 0 at this
           point (text-only board, level-hidden cached record) the
           loading overlay still gets at least one paint cycle before
           being hidden. Without this defer, the entire
           emitLoading(true) → emitLoading(false) lifecycle could
           collapse inside a single Ember run flush and the user would
           never see the loading affordance. When pending > 0 the
           initial deferred call is a no-op (maybe_emit_canvas_ready
           guards on pending > 0); the per-cell `cell_finish` callbacks
           then drive the emit when the last image actually settles. */
        loop_done = true;
        /* Seed the overlay with (0, total) now that the cell count is known, so
           the progress reads "0 / N" the instant the spinner appears rather than
           jumping in once the first image lands. */
        if (total_images > 0) { emit_progress(); }
        runLater(function() {
          if (_this.isDestroyed || _this.isDestroying) { return; }
          maybe_emit_canvas_ready();
        }, 0);
        /* Arm the no-progress stall watchdog once all per-cell image loads have
           been dispatched. From here each settled image re-arms it
           (mark_image_done); it fires only if loading wedges for STALL_MS with
           zero progress. When pending is already 0 (text-only board, fully
           cached symbols) the 0-tick maybe_emit above handles the emit and no
           watchdog is needed. This replaces the old fixed 4s deadline, which
           lifted the overlay early on slow devices while images were still
           loading — exactly the half-rendered-preview symptom we're fixing. */
        if (pending > 0) {
          arm_stall_watchdog();
        }
      }
    }
  },
  update_board: observer(
    'board.id',
    'show_links',
    'current_level',
    'base_level',
    'board.image_urls',
    'locale',
    function() {
      /* Debounce: board.id, board.image_urls, locale and friends can
         all flip within milliseconds when the parent finishes loading
         a record. Each property change used to fire its own runLater
         → render_canvas, each producing its own `pending` counter
         closure. The last closure's image-load callbacks would race
         against earlier-render image loads that decremented the
         WRONG closure's counter, leaving the latest closure stuck at
         pending > 0 until the 8s safety net fired. Coalescing into a
         single trailing render avoids the duplicate work and lets
         pending reach 0 normally. */
      var _this = this;
      if (_this._renderDebounce) { runCancel(_this._renderDebounce); }
      _this._renderDebounce = runLater(function() {
        _this._renderDebounce = null;
        if (_this.isDestroyed || _this.isDestroying) { return; }
        _this.render_canvas();
      }, 50);
    }
  ),
  willDestroyElement: function() {
    if (this._renderDebounce) {
      runCancel(this._renderDebounce);
      this._renderDebounce = null;
    }
    if (this._previewStallTimer) {
      runCancel(this._previewStallTimer);
      this._previewStallTimer = null;
    }
    if (this._posWaitTimer) {
      runCancel(this._posWaitTimer);
      this._posWaitTimer = null;
    }
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (this._resizeDebounce) {
      runCancel(this._resizeDebounce);
      this._resizeDebounce = null;
    }
    this._super(...arguments);
  },
  actions: {
  }
});
