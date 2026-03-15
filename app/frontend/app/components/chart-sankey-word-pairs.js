import Component from '@ember/component';
import { observer } from '@ember/object';

/* Chart.js and chartjs-chart-sankey loaded via app.import in ember-cli-build.js */

export default Component.extend({
  chart: null,

  draw: observer('data', function() {
    var elem = this.get('element');
    if (!elem) { return; }
    var canvas = elem.querySelector('canvas');
    if (!canvas) { return; }

    var chart = this.get('chart');
    if (chart) {
      chart.destroy();
      this.set('chart', null);
    }

    var data = this.get('data');
    if (!data || !data.length) { return; }

    var list = data;
    if (list.get) {
      list = list.toArray ? list.toArray() : list;
    }
    var chartData = list.map(function(item) {
      var from = item.from || item.get && item.get('from');
      var to = item.to || item.get && item.get('to');
      var flow = item.flow != null ? item.flow : (item.get && item.get('flow')) || (item.count != null ? item.count : (item.get && item.get('count')));
      return { from: from, to: to, flow: flow || 1 };
    }).filter(function(d) { return d.from && d.to; });

    if (chartData.length === 0) { return; }

    chart = new window.Chart(canvas, {
      type: 'sankey',
      data: {
        datasets: [{
          label: 'Word Pairs',
          data: chartData,
          colorFrom: '#428bca',
          colorTo: '#5cb85c',
          colorMode: 'gradient',
          alpha: 0.7
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false
      }
    });

    this.set('chart', chart);
  }),

  didInsertElement: function() {
    this.draw();
  },

  willDestroyElement: function() {
    var chart = this.get('chart');
    if (chart) {
      chart.destroy();
      this.set('chart', null);
    }
  }
});
