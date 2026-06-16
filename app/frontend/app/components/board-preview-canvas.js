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

// No-progress stall watchdog window (ms). This is NOT a total-load deadline — it's the
// maximum GAP with zero image progress before the preview gives up and lifts the loading
// overlay (every settled image re-arms it; see arm_stall_watchdog). It only ever fires on
// a true wedge (a CDN/network hang where neither onload nor onerror arrives), so a
// slow-but-steady load on 3G / hospital WiFi keeps the overlay up and is NOT cut off at
// this value. Named at module scope (not buried in the render closure) so it can be tuned
// in one place.
const STALL_MS = 12000;

export default Component.extend({
  appState: service('app-state'),
  persistence: service('persistence'),
  didInsertElement: function() {
    this.render_canvas();
  },
  preview_style: computed('size', 'dark_mode', function() {
    /* In dark_mode, the canvas wrapper gets a deep-navy fill + matching
       border so the speak-mode appearance is reproduced inside the
       modal. Light mode keeps the original light-gray frame. */
    var dark = this.get('dark_mode');
    if(this.get('size') == 'modal') {
      this.element.style.height = 'calc(70vh - 140px)';
      if(dark) {
        return htmlSafe('width: 100%; height: 100%; border: 1px solid rgba(255,255,255,0.10); padding: 2px; border-radius: 8px; background: #0d2438;');
      }
      return htmlSafe('width: 100%; height: 100%; border: 1px solid #ccc; padding: 2px; border-radius: 5px;');
    } else {
      this.element.style.height = 'calc(100% - 55px)';
      return htmlSafe('width: 100%; height: 100%;');
    }
  }),
  render_canvas: function() {
    if(this.get('size') == 'modal') {
      this.element.style.height = 'calc(70vh - 140px)';
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
    var preferred_symbols = this.get('preferred_symbols') || (this.appState && this.appState.get('referenced_user.preferences.preferred_symbols')) || 'original';
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
      stroke: 'rgba(255,255,255,0.35)',
      fill: 'rgba(255,255,255,0.10)',
      link_fallback_stroke: 'rgba(255,255,255,0.45)',
      link_fallback_fill: 'rgba(20,40,68,0.85)',
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
      hidden_stroke: '#ddd',
      hidden_fill: '#fff',
      stroke: '#aaa',
      fill: '#eee',
      link_fallback_stroke: '#CCC',
      link_fallback_fill: '#FFF',
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
        var radius = button_width / 20;
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
        context.font = text_height + "px Arial";
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
                var x = button_width * jdx;
                var y = button_height * idx;
                var draw_button = function(button, x, y, fill) {
                  context.beginPath();
                  if(button.hidden) {
                    context.strokeStyle = palette.hidden_stroke;
                    context.fillStyle = palette.hidden_fill;
                    context.lineWidth = border_size / 2;
                  } else {
                    context.strokeStyle = palette.stroke;
                    context.fillStyle = palette.fill;
                    if(show_links) {
                      /* Author-set colors WIN over the palette so
                         buttons that the board owner explicitly
                         colored keep their hue. Only buttons WITHOUT
                         explicit colors take the palette default. */
                      context.strokeStyle = button.border_color || palette.link_fallback_stroke;
                      context.fillStyle = button.background_color || palette.link_fallback_fill;
                    }
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
    this._super(...arguments);
  },
  actions: {
  }
});
