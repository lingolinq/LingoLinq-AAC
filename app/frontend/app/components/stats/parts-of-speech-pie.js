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
      return htmlSafe('col-sm-6 col-xs-6');
    } else {
      return htmlSafe('col-sm-4 col-xs-6');
    }
  }),
  elem_style: computed('right_side', function() {
    if(this.get('right_side')) {
      return htmlSafe('break-inside: avoid; border-left: 1px solid #eee;');
    } else {
      return htmlSafe('break-inside: avoid;');
    }
  }),
  draw: observer('usage_stats.draw_id', 'usage_stats.modeling', function() {
    var stats = this.get('usage_stats');
    var elem = this.get('element').getElementsByClassName('parts_of_speech')[0];

    LingoLinq.Visualizations.wait('pie-chart', function() {
      var parts = stats && (stats.get('modeling') ? stats.get('modeled_parts_of_speech') : stats.get('parts_of_speech'));
      if(elem && stats && parts) {
        var table = [
          ['Task', 'Instances']
        ];
        var slice_idx = 0;
        var slices = {};
        var color_check = function(c) { return c.types.indexOf(idx) >= 0; };
        for(var idx in parts) {
          table.push([idx, parts[idx]]);
          var color = LingoLinq.keyed_colors.find(color_check);
          slices[slice_idx] = {color: window.tinycolor((color || {fill: "#ccc"}).fill).saturate(10).darken(20).toHexString()};
          slice_idx++;
        }
        var data = window.google.visualization.arrayToDataTable(table);

        var options = {
          slices: slices,
          pieSliceTextStyle: {
            color: '#444'
          },
          chartArea: {
            left: 0,
            top: 0,
            width: '100%',
            height: '100%'
          },
          height: 300
        };


        var chart = new window.google.visualization.PieChart(elem);

        chart.draw(data, options);
      } else {
        elem.innerHTML = '';
      }
    });
  })
});
