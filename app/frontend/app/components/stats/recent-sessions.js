import Component from '@ember/component';
import LingoLinq from '../../app';
import i18n from '../../utils/i18n';
import { observer } from '@ember/object';

export default Component.extend({
  didInsertElement: function() {
    this.draw();
  },
  draw: observer('total', 'recent', function() {
    var total = this.get('total');
    var recent = this.get('recent');
    var elem = this.get('element').getElementsByClassName('recent_sessions')[0];

    LingoLinq.Visualizations.wait('pie-chart', function() {
      if(elem && total) {
        var table = [
          ['Type', 'Total']
        ];
        var not_recent = total - recent;
        table.push([i18n.t('in_last_2_weeks', "Last 2 Weeks"), recent]);
        table.push([i18n.t('none_recent', "None Recent"), not_recent]);
        var data = window.google.visualization.arrayToDataTable(table);

        var options = {
          title: i18n.t('user_sessions', "User With Recent Sessions"),
          legend: {
            position: 'top',
            maxLines: 2
          },
          slices: {
            0: {color: "#49c7e8"},
            1: {color: "#f7483b"}
          }
        };

        var chart = new window.google.visualization.PieChart(elem);
        chart.draw(data, options);
      }
    });
  })
});
