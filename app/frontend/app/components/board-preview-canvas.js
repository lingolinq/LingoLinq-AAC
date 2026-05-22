import Component from '@ember/component';
import LingoLinq from '../app';
import modal from '../utils/modal';
import $ from 'jquery';
import { htmlSafe } from '@ember/template';
import { later as runLater } from '@ember/runloop';
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
        var handle_button = function(button_id) {
            var button = $.extend({}, buttons[button_id] || {});
            if(!button_id || !buttons[button_id]) {
              button.hidden = true;
            }
            if(button) {
              if(button && button.level_modifications) {
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
                      context.fillStyle = palette.label;
                      context.fillText(button.label, x + (button_width / 2), y + pad + (text_height * 0.85));
                    }
                  }
                  context.restore();
                };
                draw_button(button, x, y, true);

                if(show_links && !button.hidden && button.image_id && board.get('image_urls') && board.get('image_urls')[button.image_id]) {
                  var orig_url = variant_urls[button.image_id];
                  var url = variant_urls[button.image_id + "-" + preferred_symbols] || orig_url;
                  /* Each cell with an image counts toward the overlay's
                     "all images settled" check. `cell_finish` is called
                     exactly once per cell — on onload, onerror, or any
                     early-exit path — so the pending counter always
                     reaches zero. */
                  pending++;
                  (function(button, x, y, url, persistenceService, component) {
                    var cell_done = false;
                    var cell_finish = function() {
                      if(cell_done) { return; }
                      cell_done = true;
                      mark_image_done();
                    };
                    var draw = function(url) {
                      if (component.isDestroyed || component.isDestroying) { cell_finish(); return; }
                      var img = new Image();
                      var button_ratio = image_width / image_height;
                      img.onload = function() {
                        if (component.isDestroyed || component.isDestroying) { cell_finish(); return; }
                        var image_ratio = img.width / img.height;
                        var width = image_width;
                        var height = image_height;
                        var image_x = x + border_size + pad;
                        var image_y = y + border_size + pad + text_height;
                        if(image_ratio > button_ratio) {
                          // wider than the space
                          var diff = (1 - (button_ratio / image_ratio)) * height;
                          image_y += diff / 2;
                          height -= diff;
                        } else if(image_ratio < button_ratio) {
                          // taller than the space
                          var diff = (1 - (image_ratio / button_ratio)) * width;
                          image_x += diff / 2;
                          width -= diff;
                        }
                        context.drawImage(img, image_x, image_y, width, height);
                        cell_finish();
                      };
                      img.onerror = cell_finish;
                      img.src = url;
                    };
                    persistenceService.find_url(url).then(function(uri) {
                      if (component.isDestroyed || component.isDestroying) { cell_finish(); return; }
                      draw(uri);
                    }, function() {
                      if (component.isDestroyed || component.isDestroying) { cell_finish(); return; }
                      persistenceService.find_url(orig_url).then(function(found_url) {
                        if (component.isDestroyed || component.isDestroying) { cell_finish(); return; }
                        draw(found_url);
                      }, function() {
                        if (component.isDestroyed || component.isDestroying) { cell_finish(); return; }
                        draw(url);
                      });
                    });
                  })(button, x, y, url, persistence, _this);
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
        /* Loop finished synchronously — flip the gate and try to emit.
           Only reached when we actually drew (board.id present). The
           initial render (model loading, no id) skips this and waits
           for the `update_board` observer to re-fire render_canvas
           once the real board record is available. If no images were
           queued (text-only board, persistence offline) we emit
           immediately; otherwise the per-cell `cell_finish` calls
           drive the counter down and emit on the last one. */
        loop_done = true;
        maybe_emit_canvas_ready();
        /* Safety net: if a `find_url` promise never settles (network
           hang, persistence wedged), guarantee the overlay still
           hides after a bounded wait. 8s is long enough for normal
           cached loads to win and short enough that a stuck modal
           isn't silently broken. */
        runLater(function() {
          if (_this.isDestroyed || _this.isDestroying) { return; }
          if (!emitted) {
            emitted = true;
            var cb = _this.get('onCanvasReady');
            if(cb && typeof cb === 'function') { cb(); }
          }
        }, 8000);
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
      var _this = this;
      runLater(function() {
        _this.render_canvas();
      })
    }
  ),
  actions: {
  }
});
