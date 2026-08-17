import Component from '@ember/component';
import LingoLinq from '../../app';
import i18n from '../../utils/i18n';
import { observer } from '@ember/object';
import { computed } from '@ember/object';

/**
 * "Communication over time" panel for the Reports summary.
 *
 * Plots two real series from the report's per-day payload — utterances (primary,
 * dusty denim) and words (secondary, contrast-safe verdigris) — using the same
 * Google Charts dependency the rest of the Reports page already loads via
 * `LingoLinq.Visualizations.wait` (see components/stats/word-usage.js). No new
 * chart package is introduced.
 *
 * The chart library's tooltips are pointer-only, so every plotted value is also
 * exposed in a keyboard-reachable data table below the chart.
 *
 * `_chart` / `_data` are plain instance fields, not Ember properties: nothing
 * renders off them, and keeping them off the property system means the async
 * chart callbacks need no run loop.
 */
export default Component.extend({
  tagName: 'section',
  classNames: ['report-trend'],
  attributeBindings: ['aria_labelledby:aria-labelledby'],
  aria_labelledby: 'communication-trend-title',

  _resizeObserver: null,
  _chart: null,
  _data: null,

  didInsertElement: function() {
    this._super(...arguments);
    // The observer is armed by _doDraw, alongside the chart it observes. Doing
    // it here as well returned silently whenever the component mounted with
    // `trend.available` false — no container yet — and never retried, so that
    // chart stayed non-responsive to resize for the component's whole life.
    this.draw();
  },

  willDestroyElement: function() {
    this._super(...arguments);
    this._teardownResizeObserver();
    this._chart = null;
    this._chart_node = null;
    this._data = null;
  },

  granularity_label: computed('trend.granularity', function() {
    if(this.get('trend.granularity') === 'week') {
      return i18n.t('report_trend_weekly', "Weekly totals");
    }
    return i18n.t('report_trend_daily', "Daily totals");
  }),

  /** First column header for the data table — days or week-starting dates. */
  period_label: computed('trend.granularity', function() {
    if(this.get('trend.granularity') === 'week') {
      return i18n.t('report_trend_week_of', "Week of");
    }
    return i18n.t('day', "Day");
  }),

  _chart_container: function() {
    var elem = this.get('element');
    if(!elem) { return null; }
    return elem.getElementsByClassName('report-trend__chart')[0] || null;
  },

  _buildOptions: function(elem) {
    var width = elem.offsetWidth || elem.clientWidth || 520;
    var height = elem.offsetHeight || elem.clientHeight || 288;
    var points = (this.get('trend.points') || []).length;
    var plot_left = 52;
    var plot_right = 16;
    return {
      width: width,
      height: height,
      backgroundColor: 'transparent',
      legend: { position: 'none' },
      chartArea: {
        left: plot_left,
        top: 16,
        width: Math.max(120, width - plot_left - plot_right),
        height: '74%'
      },
      // Dusty denim primary, contrast-safe verdigris secondary.
      colors: ['#2860C9', '#1A7B7A'],
      lineWidth: 3,
      pointSize: 4,
      pointShape: 'circle',
      vAxis: {
        baseline: 0,
        viewWindow: { min: 0 },
        textStyle: { color: '#53627d', fontSize: 12 },
        // Sparse grid: four horizontal rules, no minor lines.
        gridlines: { color: 'rgba(27, 54, 93, 0.1)', count: 4 },
        minorGridlines: { count: 0 },
        baselineColor: 'rgba(27, 54, 93, 0.18)'
      },
      hAxis: {
        textStyle: { color: '#53627d', fontSize: 12 },
        gridlines: { color: 'transparent' },
        minorGridlines: { count: 0 },
        slantedText: false,
        // Abbreviated labels: at most ~7 across the axis whatever the range.
        showTextEvery: Math.max(1, Math.ceil(points / 7))
      }
    };
  },

  _doDraw: function(container, data) {
    if(!container || !data) { return; }
    /* Re-check the CONTAINER, not just whether a chart exists. The template
       destroys `.report-trend__chart` whenever `trend.available` is false
       (communication-trend.hbs:21-22), so on an available -> unavailable ->
       available cycle the cached chart was still bound to the detached node and
       drew into nothing — a permanently blank card above a populated data
       table. Rebuilding also re-arms the resize observer against the new node. */
    if(this._chart && this._chart_node !== container) {
      this._teardownResizeObserver();
      this._chart = null;
    }
    if(!this._chart) {
      this._chart = new window.google.visualization.LineChart(container);
      this._chart_node = container;
      this._setupResizeObserver();
    }
    this._chart.draw(data, this._buildOptions(container));
  },

  _setupResizeObserver: function() {
    var container = this._chart_container();
    if(!container || typeof window.ResizeObserver === 'undefined') { return; }
    // Replacing an existing observer would leak the old one's handle.
    this._teardownResizeObserver();
    var _this = this;
    // Redraw only — no Ember state changes here, so no run loop is needed.
    this._resizeObserver = new window.ResizeObserver(function() {
      if(_this.isDestroyed || _this.isDestroying) { return; }
      if(_this._chart && _this._data) {
        _this._doDraw(container, _this._data);
      }
    });
    this._resizeObserver.observe(container);
  },

  _teardownResizeObserver: function() {
    if(this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
  },

  draw: observer('trend', 'draw_id', function() {
    var _this = this;
    if(!this.get('element')) { return; }
    var points = this.get('trend.points') || [];
    if(!this.get('trend.available') || points.length === 0) { return; }

    LingoLinq.Visualizations.wait('communication-trend', function() {
      if(_this.isDestroyed || _this.isDestroying) { return; }
      var rows = [[
        _this.get('period_label'),
        i18n.t('report_kpi_utterances', "Utterances"),
        i18n.t('total_words', "Total Words")
      ]];
      points.forEach(function(point) {
        rows.push([point.label, point.utterances, point.words]);
      });
      _this._data = window.google.visualization.arrayToDataTable(rows);

      // Next frame, so a container revealed by this same change is in the DOM.
      window.requestAnimationFrame(function() {
        if(_this.isDestroyed || _this.isDestroying) { return; }
        _this._doDraw(_this._chart_container(), _this._data);
      });
    });
  })
});
