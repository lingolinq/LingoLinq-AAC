import Component from '@ember/component';
import LingoLinq from '../../app';
import i18n from '../../utils/i18n';
import { observer } from '@ember/object';

export default Component.extend({
  didInsertElement: function() {
    this.draw();
  },
  draw: observer('goal.draw_id', function() {
    var goal = this.get('goal');
    var elem = this.get('element').getElementsByClassName('stats')[0];

//     LingoLinq.Visualizations.wait('bar', function() {
//       if(elem && stats) {
//
//         var data = new window.google.visualization.DataTable();
//         data.addColumn('date', 'Week Of');
//         data.addColumn('number', 'Sessions');
//         data.addColumn({type: 'string', role: 'tooltip'}); //, 'p': {'html': true}});
//
//         var rows = [];
//         stats.forEach(function(s, index) {
//           var m = window.moment(new Date(s.timestamp * 1000));
//           rows.push([{v: m._d, f: m.format('MMM DD, YYYY')}, s.sessions, "week of " + m.format('MMM Do') + "\nSessions: " + s.sessions + "\nHours: " + (Math.round((s.session_seconds || 0) * 100 / 3600) / 100)]);
//         });
//         data.addRows(rows);
//
//         var options = {
//           colors: ['#f2b367', '#f00000'],
//           title: 'Logged User Sessions for the Week',
// //         tooltip: {isHtml: true},
//           legend: {
//             position: 'none'
//           },
//           hAxis: {
//             title: 'Week of',
//             format: 'MMM dd',
//           },
//           vAxis: {
//             title: 'Total Sessions'
//           }
//         };
//
//         var chart = new window.google.visualization.ColumnChart(elem);
//
//         chart.draw(data, options);
//       }


    LingoLinq.Visualizations.wait('goal-summary', function() {
      if(elem && goal && goal.get('time_units')) {
        var level = goal.get('best_time_level') || 'weekly';
        var data = new window.google.visualization.DataTable();
        var label = null;
        if(level == 'daily') {
          label = i18n.t('day_of', 'Day of');
        } else if(level == 'weekly') {
          label = i18n.t('week_of', 'Week of');
        } else {
          label = i18n.t('month_of', 'Month of');
        }
        data.addColumn('string', label);
        data.addColumn('number', i18n.t('positive_measurements', "Positive Measurements"));
        data.addColumn('number', i18n.t('negative_measurements', "Negative Measurements"));
        data.addColumn({type: 'string', role: 'tooltip'});
        var raw_data = []; //[[goal.get('unit_description'), i18n.t('positive_measurements', "Positive Measurements"), i18n.t('negative_measurements', "Negative Measurements")]];
        var max_score = 0;
        var min_score = 0;
        goal.get('time_units').forEach(function(unit) {
          var unit_data = goal.get('time_unit_measurements')[unit.key] || {positives: 0, negatives: 0};
          raw_data.push([unit.label, unit_data.positives, 0 - unit_data.negatives, label + ' ' + unit.label + '\n' + unit_data.positives + ' positives\n' + unit_data.negatives + ' negatives']);
          max_score = Math.max(max_score, unit_data.positives || 0);
          min_score = Math.min(min_score, (0 - unit_data.negatives) || 0);
        });
        data.addRows(raw_data);
//        var data = window.google.visualization.arrayToDataTable(raw_data);

        var options = {
//          curveType: 'function',
          legend: { position: 'bottom' },
          chartArea: {
            left: 60, top: 20, height: '70%', width: '80%'
          },
          hAxis: {
            title: label
          },
          vAxis: {
            baseline: 0,
            viewWindow: {
              min: min_score,
              max: max_score
            }
          },
          colors: ['#008800', '#880000' ],
          pointSize: 3
        };

        var chart = new window.google.visualization.AreaChart(elem);
        window.google.visualization.events.addListener(chart, 'select', function() {
          var selection = chart.getSelection()[0];
          var row = raw_data[selection.row + 1];
          console.log("selected date!");
        });
        chart.draw(data, options);
      }
    });
  })
});
