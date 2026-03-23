import Component from '@ember/component';
import { observer } from '@ember/object';
import LingoLinq from '../app';
import Chart from '../utils/chart-with-sankey'; // Chart.js + Sankey plugin bundled via npm

export default Component.extend({
  chart: null,

  convertData: function(combos) {
    if (!combos) { return []; }
    var aggregated = {};
    var obj;
    if (combos.get) {
      obj = {};
      Object.keys(combos).forEach(function(k) {
        if (k.indexOf('__') !== 0) {
          obj[k] = combos.get(k);
        }
      });
    } else {
      obj = combos;
    }
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var val = obj[key];
      if (val == null) { continue; }
      var parts = key.split(',').map(function(p) { return (p || '').trim(); }).filter(Boolean);
      for (var j = 0; j < parts.length - 1; j++) {
        var from = parts[j];
        var to = parts[j + 1];
        var pairKey = from + ',' + to;
        aggregated[pairKey] = (aggregated[pairKey] || 0) + val;
      }
    }
    return Object.keys(aggregated).map(function(k) {
      var p = k.split(',');
      return { from: p[0], to: p[1], flow: aggregated[k] };
    });
  },

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

    var rawData = this.get('data');
    var data = this.convertData(rawData);
    if (data.length === 0) { return; }

    var getColor = function(key) {
      return LingoLinq.stats_colors.partsOfSpeechColor(key);
    };

    chart = new Chart(canvas, {
      type: 'sankey',
      data: {
        datasets: [{
          label: 'Parts of Speech',
          data: data,
          colorFrom: function(c) {
            return getColor(c.dataset.data[c.dataIndex].from);
          },
          colorTo: function(c) {
            return getColor(c.dataset.data[c.dataIndex].to);
          },
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
