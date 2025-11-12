import Component from '@ember/component';
import LingoLinq from '../../app';
import i18n from '../../utils/i18n';
import { observer } from '@ember/object';

export default Component.extend({
  didInsertElement: function() {
    this.draw();
  },
  draw: observer('total', 'recent', function() {
    var total = this.get('total'); // all users
    var tracked = this.get('tracked'); // having goal set that has been tracked recently
    var untracked = this.get('goal_set') - tracked; // having goal set but not tracked recently
    var elem = this.get('element').getElementsByClassName('recent_goals')[0];

    LingoLinq.Visualizations.wait('pie-chart', function() {
      if(elem && total) {
        var table = [
          ['Type', 'Total']
        ];
        table.push([i18n.t('goal_tracked', "Tracked Goal"), tracked]);
        table.push([i18n.t('untracked_goal', "Untracked Goal"), untracked]);
        table.push([i18n.t('no_goal', "No Goal Set"), total - untracked - tracked]);
        var data = window.google.visualization.arrayToDataTable(table);

        var options = {
          title: i18n.t('user_with_goals', "User With Goals Defined"),
          legend: {
            position: 'top',
            maxLines: 2
          },
          slices: {
            0: {color: "#458c5e"},
            1: {color: "#F1B366"},
            2: {color: "#888888"}
          }
        };

        var chart = new window.google.visualization.PieChart(elem);
        chart.draw(data, options);
      }
    });
  })
});

