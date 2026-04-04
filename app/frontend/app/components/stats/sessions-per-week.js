import Component from '@ember/component';
import LingoLinq from '../../app';
import i18n from '../../utils/i18n';
import { observer } from '@ember/object';

export default Component.extend({
  didInsertElement: function() {
    this.draw();
  },
  draw: observer('weekly_stats', function() {
    var elem = this.get('element').getElementsByClassName('sessions_per_week')[0];
    var stats = this.get('weekly_stats');

    LingoLinq.Visualizations.wait('bar', function() {
      if(elem && stats) {

        var data = new window.google.visualization.DataTable();
        data.addColumn('date', 'Week Of');
        data.addColumn('number', 'Sessions');
        data.addColumn({type: 'string', role: 'tooltip', 'p': {'html': true}});

        var rows = [];
        stats.forEach(function(s, index) {
          var m = window.moment(new Date(s.timestamp * 1000));
          var hours = Math.round((s.session_seconds || 0) * 100 / 3600) / 100;
          var tip = '<div style="padding:8px 12px;font-size:13px;line-height:1.5;white-space:nowrap;pointer-events:none;">' +
            '<strong>week of ' + m.format('MMM Do') + '</strong><br>' +
            'Sessions: ' + s.sessions + '<br>' +
            'Hours: ' + hours + '</div>';
          rows.push([{v: m._d, f: m.format('MMM DD, YYYY')}, s.sessions, tip]);
        });
        data.addRows(rows);

        var options = {
          colors: ['#f2b367', '#f00000'],
          title: 'Logged User Sessions for the Week',
          chartArea: {width: '80%', height: '70%'},
          height: 200,
          tooltip: {isHtml: true, trigger: 'both'},
          legend: {
            position: 'none'
          },
          hAxis: {
            title: 'Week of',
            format: 'MMM dd',
          },
          vAxis: {
            title: 'Total Sessions'
          }
        };

        var chart = new window.google.visualization.ColumnChart(elem);

        chart.draw(data, options);
      }
    });
  })
});
