import Component from '@ember/component';
import LingoLinq from '../../app';
import i18n from '../../utils/i18n';
import { htmlSafe } from '@ember/string';
import { observer } from '@ember/object';
import { computed } from '@ember/object';

export default Component.extend({
  didInsertElement: function() {
    this.draw();
  },
  draw: observer('assessment.hits', function() {
    var assessment = this.get('assessment');
    var elem = this.get('element').getElementsByClassName('mastery_preview')[0];
    if(elem && assessment) {


      // if(btn && window.ppi) {
      //   var rect = btn.getBoundingClientRect();
      //   var ppix = ((window.ppix && window.ppix / window.devicePixelRatio) || window.ppi);
      //   var ppiy = ((window.ppiy && window.ppiy / window.devicePixelRatio) || window.ppi);
      //   e.win = Math.round(rect.width / ppix * 100) / 100;
      //   e.hin = Math.round(rect.height / ppiy * 100) / 100;
      //   if(!window.ppix || !window.ppiy) {
      //     e.approxin = true;
      //   }
      // }

      // res.button_width = Math.round((best_max.win || 0) * 10) / 10;
      // res.button_height = Math.round((best_max.hin || 0) * 10) / 10;
      // res.grid_width = best_max.rows || 0;
      // res.grid_height = best_max.cols || 0; 
      // res.field = Math.min((maxes['field_sizes'] || {}).size || 0, (res.grid_width * res.grid_height) || (maxes['field_sizes'] || {}).size);
        
      var ppix = ((window.ppix && window.ppix / window.devicePixelRatio) || window.ppi);
      var ppiy = ((window.ppiy && window.ppiy / window.devicePixelRatio) || window.ppi);
      var button_width = assessment.button_width * ppix;
      var button_height = assessment.button_height * ppiy;
      var size_factor = 2;

      var context = elem.getContext('2d');
      var rect = elem.getBoundingClientRect();
      elem.width = rect.width;
      elem.height = Math.max(rect.height, button_height + 20);
      elem.style.height = elem.height + 'px';
      elem.width = elem.width * size_factor;
      elem.height = elem.height * size_factor;
      var width = elem.width;
      var height = elem.height;
      context.clearRect(0, 0, width, height);

      context.fillStyle = '#fff';
      context.strokeStyle = '#444';
      context.lineWidth = 4;
      context.beginPath();
      context.rect(10 * size_factor, 10 * size_factor, button_width * size_factor, button_height * size_factor);
      context.closePath();
      context.fill();
      context.stroke();

      context.fillStyle = '#000';
      context.textAlign = 'center';
      var line_height = Math.min(20 * size_factor, (button_height / 4) * size_factor);
      context.font = line_height + "px Arial";
      context.fillText("mastered", (10 * size_factor) + (button_width / 2 * size_factor), (20 * size_factor) + line_height);
      context.fillText("button", (10 * size_factor) + (button_width / 2 * size_factor), (20 * size_factor) + line_height + line_height);
      context.fillText("size", (10 * size_factor) + (button_width / 2 * size_factor), (20 * size_factor) + line_height + line_height + line_height);
      
      assessment.grid_width;
      assessment.grid_height;
      var field = assessment.field;
      var rows = [];
      var expected_ratio = field / (assessment.grid_width * assessment.grid_height);
      var tally = 0, shown = 0;
      for(var idx = 0; idx < assessment.grid_height; idx++) {
        var row = [];
        for(var jdx = 0; jdx < assessment.grid_width; jdx++) {
          var current_ratio = shown / tally;
          console.log(expected_ratio, current_ratio);
          tally++;
          if(current_ratio > (expected_ratio * 1.2)) {
            row.push(false);
          } else if(current_ratio < expected_ratio * 0.8 || expected_ratio == 1.0) {
            shown++;
            row.push(true);
          } else {
            var show = Math.random() > 0.5;
            if(show) { shown++; }
            row.push(show);
          }
        }
        rows.push(row);
      }
      var left = ((10 + button_width) * size_factor) + 300;
      context.textAlign = 'right';
      context.font = (20 * size_factor) + "px Arial";
      context.fillText("sample", left - 20, 30 * size_factor);
      context.fillText("field:", left - 20, 50 * size_factor);
      var top = 10 * size_factor
      var height = Math.min(200 * size_factor, elem.height - (20 * size_factor));
      var width = Math.min((rect.width * size_factor) - left - (10 * size_factor), height * (window.screen.width / window.screen.height));
      var sample_pad = 2;
      var sample_height = (height / assessment.grid_height) - (sample_pad * 2 * size_factor);
      var sample_width = (width / assessment.grid_width) - (sample_pad * 2 * size_factor);
      context.fillStyle = '#eee';
      context.strokeStyle = '#444';
      context.lineWidth = 2;
      context.beginPath();
      context.rect(left - 10, top - 10, width + 20, height + 20);
      context.closePath();
      context.fill();
      context.stroke();
      context.fillStyle = '#fff';
      context.strokeStyle = '#444';
      context.lineWidth = 4;

      for(var idx = 0; idx < rows.length; idx++) {
        for(var jdx = 0; jdx < rows[idx].length; jdx++) {
          if(rows[idx][jdx]) {
            context.beginPath();
            context.rect(left + (sample_pad * size_factor) + (jdx * (sample_width + (sample_pad * 2 * size_factor))), top + (sample_pad * size_factor) + (idx * (sample_height + (sample_pad * 2 * size_factor))), sample_width, sample_height);
            context.closePath();
            context.fill();
            context.stroke();
          }
        }
      }
      console.log(rows);
    }
  })
});
