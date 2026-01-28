import Component from '@ember/component';
import $ from 'jquery';
import { observer } from '@ember/object';
import { inject as service } from '@ember/service';

export default Component.extend({
  appState: service('app-state'),
  didInsertElement: function() {
    this.draw();
  },
  toggle_flipping: observer(
    'preferences.device.flipped_override',
    'appState.short_refresh_stamp',
    function() {
      var now = (new Date()).getTime();
      var last_flipped = this.get('last_flipped') || now;

      if(this.get('preferences.device.flipped_override')) {
        if(!this.get('last_flipped')) { this.set('last_flipped', now); }
        if(now - last_flipped > 3 * 1000) {
          this.set('flipping', !this.get('flipping'));
          this.set('last_flipped', now);
        }
      } else {
        this.set('flipped', false);
      }
    }
  ),
  draw: observer(
    'preferences',
    'preferences.device.vocalization_height',
    'preferences.device.button_spacing',
    'preferences.device.button_border',
    'preferences.device.button_text',
    'preferences.device.button_text_position',
    'preferences.device.utterance_text_only',
    'flipping',
    'preferences.device.flipped_text',
    'preferences.device.flipped_height',
    'preferences.board_background',
    function() {
      var canvas = $(this.get('element')).find("canvas")[0];
      var bounds = canvas.getBoundingClientRect();
      canvas.width = bounds.width * 2;
      canvas.height = bounds.height * 2;
      var context = canvas.getContext('2d');
      context.clearRect(0, 0, canvas.width, canvas.height);
      var radius = canvas.width / 10;

      var screen_width = Math.max(window.innerWidth, window.innerHeight);
      var screen_height = Math.min(window.innerWidth, window.innerHeight);
      var prefs = this.get('preferences');
      if(prefs.board_background && prefs.board_background != 'white') {
        context.fillStyle = '#000';
        context.rect(0, 0, canvas.width, canvas.height);
        context.fill();
      }
      var font_style = prefs.device.button_style || '';
      var font = 'Arial';
      var font_case = 'toString';
      if(font_style.match(/_caps$/)) {
        font_case = 'toUpperCase';
      } else if(font_style.match(/_small$/)) {
        font_case = 'toLowerCase';
      }
      if(font_style.match(/^comic_sans/)) {
        font = 'Comic Sans MS'
      } else if(font_style.match(/^arial/)) {
        font = 'Arial';
      } else if(font_style.match(/^open_dyslexic/)) {
        font = 'OpenDyslexic';
      } else if(font_style.match(/^architects_daughter/)) {
        font = 'ArchitectsDaughter';
      }
      var x_ratio = canvas.height / screen_height;
      var y_ratio = canvas.width / screen_width;
      var voc_height = 70 * y_ratio;
      if(prefs.device.vocalization_height == 'tiny') { voc_height = 50 * y_ratio; }
      else if(prefs.device.vocalization_height == 'medium') { voc_height = 100 * y_ratio; }
      else if(prefs.device.vocalization_height == 'large') { voc_height = 150 * y_ratio; }
      else if(prefs.device.vocalization_height == 'huge') { voc_height = 200 * y_ratio; }
      var pad = 5;
      var spacing = 5;
      if(prefs.device.button_spacing == 'minimal') { spacing = 1; }
      else if(prefs.device.button_spacing == 'extra-small') { spacing = 2; }
      else if(prefs.device.button_spacing == 'medium') { spacing = 10; }
      else if(prefs.device.button_spacing == 'large') { spacing = 20; }
      else if(prefs.device.button_spacing == 'huge') { spacing = 45; }
      else if(prefs.device.button_spacing == 'none') { spacing = 0; }
      var x_padding = spacing * x_ratio;
      var y_padding = spacing * y_ratio;
      var border = 1;
      if(prefs.device.button_border == 'none') { border = 0; }
      else if(prefs.device.button_border == 'medium') { border = 2; }
      else if(prefs.device.button_border == 'large') { border = 5; }
      else if(prefs.device.button_border == 'huge') { border = 10; }
      var border_ratio = Math.max((x_ratio + y_ratio) / 2, 1);
      border = border * border_ratio;
      var text_ratio = y_ratio; //Math.max(y_ratio, 0.6);
      var text_height = 18 * text_ratio; // prefs.device.button_text
      if(prefs.device.button_text == 'small') { text_height = 14 * text_ratio; }
      else if(prefs.device.button_text == 'large') { text_height = 22 * text_ratio; }
      else if(prefs.device.button_text == 'huge') { text_height = 35 * text_ratio; }
      var voc_text_height = text_height;
      var position = prefs.device.button_text_position || 'top';
      var text_only = position == 'text_only';
      var voc_text_only = text_only || prefs.device.utterance_text_only;
      var flipped_voc_height = voc_height;
      var flipped_text_height = voc_text_height;
      if(prefs.device.flipped_override) {
        var flipped_text_height = 18 * text_ratio;
        if(prefs.device.flipped_text == 'small') { flipped_text_height = 14 * text_ratio; }
        else if(prefs.device.flipped_text == 'large') { flipped_text_height = 22 * text_ratio; }
        else if(prefs.device.flipped_text == 'huge') { flipped_text_height = 35 * text_ratio; }
        flipped_voc_height = 70 * text_ratio;
        if(prefs.device.flipped_height == 'tiny') { flipped_voc_height = 50 * y_ratio; }
        else if(prefs.device.flipped_height == 'medium') { flipped_voc_height = 100 * y_ratio; }
        else if(prefs.device.flipped_height == 'large') { flipped_voc_height = 150 * y_ratio; }
        else if(prefs.device.flipped_height == 'huge') { flipped_voc_height = 200 * y_ratio; }
      }
      var flipping = this.get('flipping');
      if(flipping) {
        voc_height = flipped_voc_height;
        voc_text_height = flipped_text_height;
      }
      var top = pad + voc_height;
      var radius = 3;
      var rounded = function(x, y, width, height, opts) {
        context.beginPath();
        context.moveTo(x + radius, y);
        context.lineTo(x + width - radius, y);
        context.quadraticCurveTo(x + width, y, x + width, y + radius);
        context.lineTo(x + width, y + height - radius);
        context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        context.lineTo(x + radius, y + height);
        context.quadraticCurveTo(x, y + height, x, y + height - radius);
        context.lineTo(x, y + radius);
        context.quadraticCurveTo(x, y, x + radius, y);
        context.closePath();
        context.fillStyle = '#eee';
        context.fill();
        if(opts && opts.text) {
          context.fillStyle = '#000';
          context.textAlign = opts.align || 'center';
          var offset = opts.align == 'left' ? (pad + pad) : (width / 2);
          context.font = opts.text_height + 'px ' + font;
          if(opts.flipped) {
            context.save();
            context.translate(x + width - pad, y + height);
            context.rotate(Math.PI);
            context.fillText(opts.text[font_case](), 0, opts.text_height);
            if(opts.text2) {
              context.fillText(opts.text2[font_case](), 0, opts.text_height + (pad / 2) + opts.text_height + (pad / 2));
            }
            context.restore();
          } else {
            if(!opts.position || opts.position == 'top') {
              context.fillText(opts.text[font_case](), x + offset, y + opts.text_height + (pad / 2), width);
              if(opts.text2 && y + opts.text_height + (pad / 2) + opts.text_height + (pad / 2) < voc_height) {
                context.fillText(opts.text2[font_case](), x + offset, y + opts.text_height + (pad / 2) + opts.text_height + (pad / 2), width);
              }
            } else if(opts.position == 'bottom') {
              context.fillText(opts.text[font_case](), x + offset, y + height - (pad / 2), width);
            } else if(opts.position == 'text_only') {
              context.fillText(opts.text[font_case](), x + offset, y + (height / 2) + opts.text_height / 2, width);
            }
          }
        }
        context.lineWidth = 1;
        if(opts && opts.border) {
          context.lineWidth = Math.max(opts.border, 1);
        }
        if(!opts || !opts.border || opts.border > 0) {
          context.strokeStyle = '#000';
          if(prefs.board_background == 'black') {
            context.strokeStyle = '#ccc';
          }
          context.stroke();
        }
      };
      var color_idx = 0;
      var colors = ['rgba(255, 255, 0, 0.2)', 'rgba(255, 0, 0, 0.2)', 'rgba(0, 255, 0, 0.2)', 'rgba(0, 0, 255, 0.2)', 'rgba(0, 255, 255, 0.2)'];
      var circle = function(x, y, width, height) {
        context.lineWidth = 1;
        context.fillStyle = '#000';
        context.beginPath();
        var min = Math.min(width, height);
        if(min > 0) {
          context.fillStyle = colors[color_idx % colors.length];
          color_idx++;
          context.arc(x + width / 2, y + height / 2, min / 2, 0, 2 * Math.PI);
          context.fill();
          context.stroke();
        }
      };
      var text_opts = {};
      var voc_left = pad + voc_height + pad + pad;
      if(voc_text_only || flipping) {
        text_opts = {text: "abc defg hijkl mno pqr stuv wxy z", text2: "qwer tyu io pasd fgh j klz xcvb nm", position: 'top', align: 'left', text_height: voc_text_height, flipped: flipping};
        // draw text either normal or flipped
      }
      rounded(pad, pad, voc_height, voc_height);
      rounded(voc_left, pad, canvas.width - pad - pad - pad - pad - voc_height - voc_height - pad - pad, voc_height, text_opts);
      if(voc_text_only || flipping) { } else {
        for(var idx = 0; idx < 5; idx++) {
          var btn_width = Math.min(voc_height, canvas.width / 8);
          circle(voc_left + pad + (idx * btn_width) + pad, pad + pad, btn_width - pad - pad, voc_height - pad - pad - voc_text_height);
          context.fillStyle = '#000';
          context.textAlign = 'center';
          context.font = voc_text_height + "px " + font;
          context.fillText("abc", voc_left + pad + (idx * btn_width) + (btn_width / 2), voc_height)
        }
        // draw a couple shapes with words
      }
      rounded(canvas.width - pad - voc_height, pad, voc_height, voc_height);
      var rows = 4; // user's home board grid
      var cols = 6; // user's home board grid
      var button_outer_height = (canvas.height - top - pad - pad) / rows;
      var button_outer_width = (canvas.width - pad) / cols;
      for(var r = 0; r < rows; r++) {
        for(var c = 0; c < cols; c++) {
          rounded((pad/2) + (c * button_outer_width) + x_padding, pad + top + (r * button_outer_height) + y_padding, button_outer_width - x_padding - x_padding, button_outer_height - y_padding - y_padding, {border: border, text_height: text_height, text: 'abcdefghij'.substring(0, 3 + Math.round(Math.random() * 7)), position: position});
          if(!text_only) {
            circle((c * button_outer_width) + pad + x_padding, pad + top + (r * button_outer_height) + y_padding + text_height + pad + pad, button_outer_width - x_padding - x_padding - pad, button_outer_height - y_padding - y_padding - text_height - text_height - pad - pad - pad - pad);
          }
          // draw text
          // draw shape
        }
      }
    }
  )
});

