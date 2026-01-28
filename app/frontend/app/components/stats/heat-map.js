import Component from '@ember/component';
import LingoLinq from '../../app';
import i18n from '../../utils/i18n';
import { htmlSafe } from '@ember/template';
import { observer } from '@ember/object';
import { computed } from '@ember/object';

export default Component.extend({
  didInsertElement: function() {
    this.draw();
  },
  elem_class: computed('side_by_side', function() {
    if(this.get('side_by_side')) {
      return htmlSafe('col-sm-6');
    } else {
      return htmlSafe('col-sm-8');
    }
  }),
  elem_style: computed('right_side', function() {
    if(this.get('right_side')) {
      return htmlSafe('border-left: 1px solid #eee;');
    } else {
      return htmlSafe('');
    }
  }),
  draw: observer('usage_stats.draw_id', function() {
    var stats = this.get('usage_stats');
    var elem = this.get('element').getElementsByClassName('touch_locations')[0];

    LingoLinq.Visualizations.wait('heat-map', function() {
      if(elem && stats && stats.get('touch_locations')) {
        var touch_locations = {};
        var max = 0;
        for(var key in stats.touch_locations) {
          var points = key.split(/,/);
          var x = Math.round(parseFloat(points[0]) * 100 / 2);
          var y = Math.round(parseFloat(points[1]) * 100 / 4);
          if(x !== undefined && y !== undefined) {
            touch_locations[x] = touch_locations[x] || {};
            touch_locations[x][y] = touch_locations[x][y] || 0;
            touch_locations[x][y] = touch_locations[x][y] + stats.touch_locations[key];
            max = Math.max(max, touch_locations[x][y]);
          }
        }

        var context = elem.getContext('2d');
        var width = elem.width;
        var height = elem.height;
        context.clearRect(0, 0, width, height);
        var stepx = width / 51;
        var stepy = height / 26;

        var positions = [];
        for(var idx = 0; idx < 51; idx++) {
          for(var jdx = 0; jdx < 26; jdx++) {
            if(touch_locations[idx] && touch_locations[idx][jdx]) {
              var centerX = (stepx / 2) + (stepx * idx);
              var centerY = (stepy / 2) + (stepy * jdx);
              positions.push({x: centerX, y: centerY, count: touch_locations[idx][jdx]});
            }
          }
        }
        positions = positions.sort(function(a, b) {
          return a.count - b.count;
        });
        ([0,1,2]).forEach(function(iteration) {
          positions.forEach(function(position) {
            var count = position.count;
            var color_pre = null;
            if(iteration === 0 && (count > (max / 50))) {
              color_pre = "rgba(0, 0, 255, ";
            } else if(iteration == 1 && (count > (max / 4))) {
              color_pre = "rgba(255, 255, 0, ";
            } else if(iteration == 2 && (count > (max / 2))) {
              color_pre = "rgba(255, 0, 0, ";
            }
            if(color_pre) {
              context.beginPath();
              var radius = stepy * 5, inner = stepy, outer = stepy * 5;
              if(iteration == 1) { radius = stepy * 4; inner = stepy / 2; outer = stepy * 4; }
              else if(iteration == 2) { radius = stepy * 2; inner = stepy / 4; outer = stepy * 2; }
              context.arc(position.x, position.y, radius, 0, 2 * Math.PI, false);
              var grd = context.createRadialGradient(position.x, position.y, inner, position.x, position.y, outer);
              grd.addColorStop(0, color_pre + '1.0)');
              grd.addColorStop(0.3, color_pre + '0.5)');
              grd.addColorStop(1, color_pre + '0.0)');
              context.fillStyle = grd;
              context.fill();
            }
          });
        });
      }
    });
  })
});
