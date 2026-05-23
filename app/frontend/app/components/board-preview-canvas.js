import Component from '@ember/component';
import LingoLinq from '../app';
import modal from '../utils/modal';
import $ from 'jquery';
import { htmlSafe } from '@ember/template';
import { later as runLater, cancel as runCancel } from '@ember/runloop';
import { observer } from '@ember/object';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

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
    var maybe_emit_canvas_ready = function() {
      if(emitted) { return; }
      if(!loop_done) { return; }
      if(pending > 0) { return; }
      emitted = true;
      var cb = _this.get('onCanvasReady');
      if(cb && typeof cb === 'function') { cb(); }
    };
    var mark_image_done = function() {
      if(pending > 0) { pending--; }
      maybe_emit_canvas_ready();
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
      label: '#f1f4f8'
    } : {
      bg: null,
      hidden_stroke: '#ddd',
      hidden_fill: '#fff',
      stroke: '#aaa',
      fill: '#eee',
      link_fallback_stroke: '#CCC',
      link_fallback_fill: '#FFF',
      label: '#000'
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
                    img.onerror = cell_finish;
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
        runLater(function() {
          if (_this.isDestroyed || _this.isDestroying) { return; }
          maybe_emit_canvas_ready();
        }, 0);
        /* Safety net: if any per-cell image load wedges (rare now that
           we no longer route through persistence.find_url, but the
           browser can still hang on a slow CDN), guarantee the overlay
           still hides after a bounded wait. 4s is short enough that a
           stuck preview isn't silently broken; cached/CDN-warm loads
           land in well under 1s. */
        runLater(function() {
          if (_this.isDestroyed || _this.isDestroying) { return; }
          if (!emitted) {
            emitted = true;
            var cb = _this.get('onCanvasReady');
            if(cb && typeof cb === 'function') { cb(); }
          }
        }, 4000);
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
    this._super(...arguments);
  },
  actions: {
  }
});
