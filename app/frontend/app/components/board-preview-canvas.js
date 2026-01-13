import Component from '@ember/component';
import LingoLinq from '../app';
import modal from '../utils/modal';
import app_state from '../utils/app_state';
import persistence from '../utils/persistence';
import $ from 'jquery';
import { htmlSafe } from '@ember/template';
import { later as runLater } from '@ember/runloop';
import { observer } from '@ember/object';
import { computed } from '@ember/object';

export default Component.extend({
  didInsertElement: function() {
    this.render_canvas();
  },
  preview_style: computed('size', function() {
    if(this.get('size') == 'modal') {
      this.element.style.height = 'calc(70vh - 140px)';
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
    var board = this.get('board');
    var level = this.get('current_level') || this.get('base_level') || 10;
    var show_links = this.get('show_links');
    var preferred_symbols = this.get('preferred_symbols') || app_state.get('referenced_user.preferences.preferred_symbols') || 'original';

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
        var variant_urls = board.variant_image_urls(app_state.get('currentUser.preferences.skin'));
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
                    context.strokeStyle = "#ddd";
                    context.fillStyle = "#fff";
                    context.lineWidth = border_size / 2;
                  } else {
                    context.strokeStyle = "#aaa";
                    context.fillStyle = "#eee";
                    if(show_links) {
                      context.strokeStyle = button.border_color || '#CCC';
                      context.fillStyle = button.background_color || '#FFF';
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
                      context.fillStyle = '#000';
                      context.fillText(button.label, x + (button_width / 2), y + pad + (text_height * 0.85));
                    }
                  }
                  context.restore();
                };
                draw_button(button, x, y, true);

                if(show_links && !button.hidden && button.image_id && board.get('image_urls') && board.get('image_urls')[button.image_id]) {
                  var orig_url = variant_urls[button.image_id];
                  var url = variant_urls[button.image_id + "-" + preferred_symbols] || orig_url;
                  (function(button, x, y, url) {
                    var draw = function(url) {
                      var img = new Image();
                      var button_ratio = image_width / image_height;
                      img.onload = function() {
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
                      };
                      img.src = url;
                    };
                    persistence.find_url(url).then(function(uri) {
                      draw(uri);
                    }, function() {
                      persistence.find_url(orig_url).then(function(found_url) {
                        draw(found_url);
                      }, function() {
                        draw(url);
                      });
                    });
                  })(button, x, y, url);
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
