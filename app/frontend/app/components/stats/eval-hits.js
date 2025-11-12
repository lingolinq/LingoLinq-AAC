import Component from '@ember/component';
import $ from 'jquery';
import LingoLinq from '../../app';
import i18n from '../../utils/i18n';
import { observer } from '@ember/object';

export default Component.extend({
  didInsertElement: function() {
    this.draw();
  },
  draw: observer('hits', function() {
    var canvas = $(this.get('element')).find("canvas")[0];
    var bounds = canvas.getBoundingClientRect();
    canvas.width = bounds.width;
    canvas.height = bounds.height;
    var context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    var radius = canvas.width / 10;
    for(var idx = 0; idx < 2; idx++) {
      (this.get('hits') || []).forEach(function(hit) {
        if(hit.possibly_correct && ((idx == 0 && hit.correct) || (idx == 1 && !hit.correct))) {
          var color_pre = "rgba(255, 0, 0, ";
          if(hit.correct) {
            color_pre = "rgba(0, 255, 0, ";
          }
          context.beginPath();
          var x = hit.cpctx * canvas.width;
          var y = hit.cpcty * canvas.height;
          context.arc(x, y, radius, 0, 2 * Math.PI, false);
          var grd = context.createRadialGradient(x, y, radius / 12, x, y, radius);
          grd.addColorStop(0, color_pre + '0.7)');
          grd.addColorStop(0.3, color_pre + '0.5)');
          grd.addColorStop(0.95, color_pre + '0.0)');
          context.fillStyle = grd;
          context.fill();
        }
      });
    }
    (this.get('hits') || []).forEach(function(hit) {
      if(hit.pctx != null && hit.pcty != null) {
        var color = "rgba(0, 0, 255, 0.6)";
        if(hit.partial) {
          color = "rgba(150, 150, 0, 0.7)";
        }
        context.beginPath();
        context.arc(hit.pctx * canvas.width, hit.pcty * canvas.height, radius / 8, 0, 2 * Math.PI, false);
        context.lineWidth = radius / 32;
        context.strokeStyle = color;
        context.stroke();
      }
    });
  })
});

