import Component from '@ember/component';
import { run } from '@ember/runloop';
import LingoLinq from '../../app';
import i18n from '../../utils/i18n';
import { htmlSafe } from '@ember/template';
import { observer } from '@ember/object';
import { computed } from '@ember/object';

export default Component.extend({
  _resizeObserver: null,

  didInsertElement: function() {
    this.draw();
    this._setupResizeObserver();
  },

  willDestroyElement: function() {
    this._teardownResizeObserver();
    this.set('_wordUsageChart', null);
    this.set('_wordUsageData', null);
    this.set('_wordUsageRawData', null);
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
  _buildOptions: function(elem, maxWords) {
    var chartWidth = elem.offsetWidth || elem.clientWidth || 408;
    var chartHeight = elem.offsetHeight || elem.clientHeight || 320;
    var plotLeft = 44;
    var plotRight = 12;
    return {
      width: chartWidth,
      height: chartHeight,
      curveType: 'function',
      legend: { position: 'bottom', textStyle: { color: '#4a5568', fontSize: 12, fontName: 'inherit' } },
      backgroundColor: 'transparent',
      chartArea: {
        left: plotLeft,
        top: 20,
        width: Math.max(100, chartWidth - plotLeft - plotRight),
        height: '70%'
      },
      vAxis: {
        baseline: 0,
        viewWindow: { min: 0, max: maxWords },
        textStyle: { color: 'rgba(17, 26, 46, 0.6)', fontSize: 11, fontName: 'inherit' },
        gridlines: { color: 'rgba(17, 26, 46, 0.08)' },
        baselineColor: 'rgba(17, 26, 46, 0.12)'
      },
      hAxis: {
        textStyle: { color: 'rgba(17, 26, 46, 0.6)', fontSize: 11, fontName: 'inherit' },
        gridlines: { color: 'rgba(17, 26, 46, 0.06)' }
      },
      colors: ['#2cb7b0', '#5b8def', '#d4a84b'],
      lineWidth: 2,
      pointSize: 4,
      pointShape: 'circle'
    };
  },

  _doDraw: function(elem, data, rawData, maxWords, chart) {
    if (!elem || !data) { return; }
    var options = this._buildOptions(elem, maxWords);
    if (!chart) {
      chart = new window.google.visualization.LineChart(elem);
      var _this = this;
      window.google.visualization.events.addListener(chart, 'select', function() {
        var selection = chart.getSelection()[0];
        if (rawData && selection && rawData[selection.row + 1]) {
          var row = rawData[selection.row + 1];
          if (_this.show_logs) {
            _this.show_logs({ start: row[0], end: row[0] });
          }
        }
      });
      this.set('_wordUsageChart', chart);
      this.set('_wordUsageRawData', rawData);
      this.set('_wordUsageMaxWords', maxWords);
    }
    chart.draw(data, options);
  },

  _setupResizeObserver: function() {
    var elem = this.get('element');
    if (!elem || typeof window.ResizeObserver === 'undefined') { return; }
    var container = elem.getElementsByClassName('daily_stats')[0];
    if (!container) { return; }
    var _this = this;
    this._resizeObserver = new window.ResizeObserver(function() {
      run(function() {
        var chart = _this.get('_wordUsageChart');
        var data = _this.get('_wordUsageData');
        var rawData = _this.get('_wordUsageRawData');
        var maxWords = _this.get('_wordUsageMaxWords');
        if (chart && data && container) {
          _this._doDraw(container, data, rawData, maxWords, chart);
        }
      });
    });
    this._resizeObserver.observe(container);
  },

  _teardownResizeObserver: function() {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
  },

  draw: observer('usage_stats.draw_id', 'ref_stats.draw_id', function() {
    var stats = this.get('usage_stats');
    var ref_stats = this.get('ref_stats');
    var elem = this.get('element').getElementsByClassName('daily_stats')[0];
    var _this = this;

    LingoLinq.Visualizations.wait('word-graph', function() {
      if (!elem || !stats || !stats.get('days')) { return; }
      var raw_data = [[i18n.t('day', "Day"), i18n.t('total_words', "Total Words"), i18n.t('unique_words', "Unique Words")]];
      if (stats.get('modeled_words')) {
        raw_data[0].push(i18n.t('modeled_words', "Modeled Words"));
      }
      var max_words = 0;
      stats.get('days_sorted').forEach(function(day_data) {
        var row = [day_data.day, day_data.total_words, day_data.unique_words];
        if (stats.get('modeled_words')) {
          row.push(day_data.modeled_words);
        }
        raw_data.push(row);
        max_words = Math.max(max_words, day_data.total_words || 0);
      });
      if (ref_stats) {
        for (var day in ref_stats.get('days')) {
          var day_data = ref_stats.get('days')[day];
          max_words = Math.max(max_words, day_data.total_words || 0);
        }
      }
      var data = window.google.visualization.arrayToDataTable(raw_data);
      _this.set('_wordUsageData', data);
      _this.set('_wordUsageRawData', raw_data);
      _this.set('_wordUsageMaxWords', max_words);

      run.schedule('afterRender', _this, function() {
        requestAnimationFrame(function() {
          var el = _this.get('element');
          if (!el || _this.isDestroyed || _this.isDestroying) { return; }
          var container = el.getElementsByClassName('daily_stats')[0];
          var chart = _this.get('_wordUsageChart');
          _this._doDraw(container, data, raw_data, max_words, chart);
        });
      });
    });
  }),
  actions: {
    set_modeling: function(modeling) {
      this.set('usage_stats.modeling', !!modeling);
      if(this.get('ref_stats')) {
        this.set('ref_stats.modeling', !!modeling);
      }
    }
  }
});
