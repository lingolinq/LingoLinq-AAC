import Component from '@ember/component';
import EmberObject from '@ember/object';
import { set as emberSet, get as emberGet } from '@ember/object';
import $ from 'jquery';
import { htmlSafe } from '@ember/template';
import buttonTracker from '../utils/raw_events';

import editManager from '../utils/edit_manager';
import capabilities from '../utils/capabilities';
import { observer } from '@ember/object';
import { computed } from '@ember/object';

export default Component.extend({
  didInsertElement: function() {
    this.redraw();
  },
  preview_style: computed('width', 'height', function() {
    var width = this.get('width') || 200;
    var height = this.get('height') || 200;
    return htmlSafe("width: " + width + "px; height: " + height + "px;");
  }),
  redraw: observer('button.id', function() {
    var button = this.get('button');
    var $canvas = $(this.element).find("canvas");
    var _this = this;
    if($canvas[0]) {
      $canvas.attr('width', 500);
      $canvas.attr('height', 500);
      var context = $canvas[0].getContext('2d');
      var width = 500;
      var height = 500;
      var radius = 50;
      var pad = 20;
      context.save();
      context.clearRect(0, 0, width, height);
      context.beginPath();
      context.moveTo(pad + radius, pad);
      context.lineTo(width - pad - radius, pad);
      context.arcTo(width - pad, pad, width - pad, pad + radius, radius);
      context.lineTo(width - pad, height - pad - radius);
      context.arcTo(width - pad, height - pad, width - pad - radius, height - pad, radius);
      context.lineTo(pad + radius, height - pad);
      context.arcTo(pad, height - pad, pad, height - pad - radius, radius);
      context.lineTo(pad, pad + radius);
      context.arcTo(pad, pad, pad + radius, pad, radius);
      context.lineWidth = 25;
      context.fillStyle = button.background_color || '#fff';
      context.strokeStyle = button.border_color || '#ddd';
      context.stroke();
      context.fill();

      context.textAlign = 'center';
      var size = 80;
      context.font = size + 'px Arial';
      while(size > 40 && context.measureText(button.label || '').width > 470) {
        size = size - 5;
        context.font = size + 'px Arial';
      }
      context.fillStyle = '#000';
      context.save();
      context.rect(pad, 0, width - pad - pad - context.lineWidth, height);
      context.clip();
      if(size <= 40 && context.measureText(button.label || '').width > 470) {
        var words = button.label.split(/\s/);
        var top = [];
        while(top.join(' ').length < button.label.length / 2) {
          top.push(words.shift());
        }
        context.fillText(top.join(' '), width / 2, pad + (pad / 3) + size);
        context.fillText(words.join(' '), width / 2, pad + (pad / 3) + size + size);
      } else {
        context.fillText(button.label, width / 2, pad + size);
      }
      context.restore();
      context.save();
      context.rect(pad + pad, pad + pad, width - pad - pad, height - pad - pad);
      context.clip();
      if(emberGet(button, 'local_image_url') || emberGet(button, 'image_url') || emberGet(button, 'image.url') || emberGet(button, 'image')) {
        var img = new Image();
        img.src = emberGet(button, 'local_image_url') || emberGet(button, 'image_url') || emberGet(button, 'image.url') || emberGet(button, 'image');
        img.onload = function() {
          if(_this.get('button.id') == button.id) {
            context.drawImage(img, 75, 125, 350, 350);
          }
        };
      }
      context.restore();
      context.restore();
    }
  })
});
