import { module, test } from 'qunit';
import { analyze, formattedDateRange } from 'frontend/utils/report_summary';

// Regression lock for the Reports "Communication progress" summary derivation
// (utils/report_summary.js). The rules under test are DATA-INTEGRITY rules, not
// cosmetics: the stats pipeline has no prompting/independence metric and no
// previous-period payload, so the summary may only ever describe what the
// selected range actually contains.

function day(date, values) {
  return Object.assign({day: date, total_sessions: 0, total_utterances: 0, total_words: 0, words_per_utterance: 0}, values || {});
}

// Builds a fake Stats object: `days` plus the top-level totals the server sends.
function stats(days, totals) {
  var data = Object.assign({
    days: {},
    start_at: '2026-06-01T00:00:00Z',
    end_at: '2026-06-28T00:00:00Z',
    start_date_field: '2026-06-01',
    end_date_field: '2026-06-28'
  }, totals || {});
  days.forEach(function(d) { data.days[d.day] = d; });
  data.days_sorted = days;
  data.has_data = (data.total_sessions || 0) > 0;
  return {
    get: function(key) { return data[key]; }
  };
}

// n days starting 2026-06-01, each with the given per-day values.
function span(count, values, offset) {
  var days = [];
  for(var i = 0; i < count; i++) {
    var date = new Date(Date.UTC(2026, 5, 1 + i + (offset || 0)));
    days.push(day(date.toISOString().substring(0, 10), typeof values === 'function' ? values(i) : values));
  }
  return days;
}

function totalsFor(days) {
  return days.reduce(function(acc, d) {
    acc.total_sessions += d.total_sessions;
    acc.total_utterances += d.total_utterances;
    acc.total_words += d.total_words;
    return acc;
  }, {total_sessions: 0, total_utterances: 0, total_words: 0});
}

module('Unit | Utility | report summary', function() {
  test('rising usage reports an increase, sourced from the earlier half of the range', function(assert) {
    var days = span(28, function(idx) {
      var later = idx >= 14;
      return {total_sessions: 1, total_utterances: later ? 12 : 10, total_words: later ? 24 : 20, words_per_utterance: 2};
    });
    var totals = totalsFor(days);
    var res = analyze(stats(days, totals));

    assert.ok(res.hasReportData, 'has data');
    assert.ok(res.comparisonAvailable, 'comparison derived from the range itself');
    assert.equal(res.primaryInsight.tone, 'positive', 'positive tone');
    assert.equal(res.primaryInsight.title, 'Communication increased this period', 'increase headline');
    assert.ok(res.primaryInsight.description.indexOf('20%') !== -1, 'states the real percentage (140 -> 168)');
    // The claim must name the period it is comparing against, never imply a
    // previous report period the summary never fetched.
    assert.ok(res.primaryInsight.description.indexOf(res.comparisonPeriodLabel) !== -1, 'names the compared range');
    assert.ok(res.primaryInsight.title.indexOf('independent') === -1, 'never claims independence');
  });

  test('a zero-utterance baseline never reports "steady" against a KPI that says increase', function(assert) {
    // Sessions in both halves, but utterances only in the later one — the common
    // shape when a communicator uses buttons before using the sentence box.
    // The comparison is "available" (it is gated on sessions), but there is no
    // utterance baseline to characterise a trend against, so the headline must
    // fall back to the neutral snapshot rather than claiming no change.
    var days = span(28, function(idx) {
      var later = idx >= 14;
      return {total_sessions: 1, total_utterances: later ? 20 : 0, total_words: later ? 40 : 0, words_per_utterance: later ? 2 : 0};
    });
    var res = analyze(stats(days, totalsFor(days)));

    assert.ok(res.comparisonAvailable, 'sessions in the earlier half still make a comparison available');
    assert.strictEqual(res.primaryInsight.title.indexOf('steady'), -1,
      'must not claim the period stayed steady when it went from no utterances to some');
    assert.strictEqual(res.primaryInsight.tone, 'neutral', 'snapshot tone, not a trend claim');

    // And it must not contradict the Utterances KPI sitting beside it. That KPI
    // is deterministic here: the earlier half is 0, below MIN_BASE_FOR_PERCENT,
    // so countChange takes the absolute-delta branch and reports the rise.
    var utterances = res.summaryMetrics.filter(function(m) { return m.key === 'utterances'; })[0];
    assert.strictEqual(utterances.contextLabel, 'Increase',
      'the KPI reports the rise, so the headline must not have called it steady');
  });

  test('every change is labelled in words and the dates are stated for the row', function(assert) {
    // No arrow may appear without a word naming its direction, and no percentage
    // without the reader being able to see what period it compares.
    var days = span(28, function(idx) {
      var later = idx >= 14;
      return {total_sessions: 1, total_utterances: later ? 12 : 10, total_words: later ? 24 : 20, words_per_utterance: 2};
    });
    var res = analyze(stats(days, totalsFor(days)));

    assert.equal(res.comparisonPeriodLabel, 'Jun 1 – Jun 14', 'earlier half named by its dates');
    assert.equal(
      res.comparisonBasis,
      'Every change below compares the later half of the selected period (Jun 15 – Jun 28) with its earlier half (Jun 1 – Jun 14).',
      'both halves spelled out under the KPI row'
    );

    var utterances = res.summaryMetrics.find(function(m) { return m.key === 'utterances'; });
    assert.equal(utterances.context, '↑ 20%', 'signed change');
    assert.equal(utterances.contextLabel, 'Increase', 'direction named in words, not just by arrow and color');

    res.summaryMetrics.forEach(function(metric) {
      if (metric.context) {
        assert.ok(
          ['Increase', 'Decrease', 'No change'].indexOf(metric.contextLabel) !== -1,
          metric.key + ' carries a direction word'
        );
      }
    });
  });

  test('a decrease is labelled Decrease', function(assert) {
    var days = span(28, function(idx) {
      var later = idx >= 14;
      return {total_sessions: 1, total_utterances: later ? 5 : 20, total_words: later ? 10 : 40, words_per_utterance: 2};
    });
    var res = analyze(stats(days, totalsFor(days)));
    var utterances = res.summaryMetrics.find(function(m) { return m.key === 'utterances'; });
    assert.equal(utterances.contextLabel, 'Decrease', 'decrease named');
    assert.equal(utterances.tone, 'negative', 'negative tone');
  });

  test('falling usage reports a decrease and never dresses it up as progress', function(assert) {
    var days = span(28, function(idx) {
      var later = idx >= 14;
      return {total_sessions: 1, total_utterances: later ? 5 : 20, total_words: later ? 10 : 40, words_per_utterance: 2};
    });
    var res = analyze(stats(days, totalsFor(days)));

    assert.equal(res.primaryInsight.tone, 'negative', 'negative tone');
    assert.equal(res.primaryInsight.title, 'Communication was lower this period', 'decrease headline');
    var utterances = res.summaryMetrics.find(function(m) { return m.key === 'utterances'; });
    assert.equal(utterances.tone, 'negative', 'utterance KPI is negative');
    assert.ok(utterances.context.indexOf('↓') === 0, 'direction shown by glyph, not color alone');
    assert.ok(utterances.accessibleContext.indexOf('down') !== -1, 'accessible sentence states the direction');
  });

  test('change inside the dead band reads as steady, not as growth', function(assert) {
    var days = span(28, function(idx) {
      return {total_sessions: 1, total_utterances: idx >= 14 ? 21 : 20, total_words: 40, words_per_utterance: 2};
    });
    var res = analyze(stats(days, totalsFor(days)));

    assert.equal(res.primaryInsight.tone, 'neutral', '5% dead band keeps noise neutral');
    assert.equal(res.primaryInsight.title, 'Communication stayed steady this period', 'steady headline');
  });

  test('too short to split: neutral snapshot with no invented comparison', function(assert) {
    var days = span(3, {total_sessions: 2, total_utterances: 9, total_words: 18, words_per_utterance: 2});
    var res = analyze(stats(days, {total_sessions: 6, total_utterances: 27, total_words: 54, words_per_utterance: 2}));

    assert.notOk(res.comparisonAvailable, 'no comparison available');
    assert.equal(res.comparisonPeriodLabel, '', 'no comparison label');
    assert.equal(res.comparisonBasis, '', 'no basis statement without a comparison');
    assert.equal(res.primaryInsight.tone, 'neutral', 'neutral tone');
    assert.equal(res.primaryInsight.title, '27 utterances across 6 sessions', 'snapshot headline from live values');
    res.summaryMetrics.forEach(function(metric) {
      assert.equal(metric.context, null, metric.key + ' shows no change context');
    });
  });

  test('an empty earlier half is not a comparison baseline', function(assert) {
    // Nothing recorded in the first half — a percentage against zero would be
    // meaningless, so the summary falls back to the snapshot form.
    var days = span(20, function(idx) {
      return idx >= 10 ? {total_sessions: 1, total_utterances: 8, total_words: 16, words_per_utterance: 2} : {};
    });
    var res = analyze(stats(days, totalsFor(days)));

    assert.notOk(res.comparisonAvailable, 'no baseline, no comparison');
    assert.equal(res.primaryInsight.tone, 'neutral', 'neutral tone');
  });

  test('no data at all yields the empty shape', function(assert) {
    var res = analyze(stats([], {total_sessions: 0, total_utterances: 0}));

    assert.notOk(res.hasReportData, 'no report data');
    assert.equal(res.primaryInsight, null, 'no headline');
    assert.deepEqual(res.summaryMetrics, [], 'no KPIs');
    assert.deepEqual(res.reportInsights, [], 'no insights');
    assert.notOk(res.hasInsights, 'hasInsights false');
    assert.notOk(res.trend.available, 'no trend');
  });

  test('null stats does not throw', function(assert) {
    var res = analyze(null);
    assert.notOk(res.hasReportData, 'no report data');
    assert.equal(formattedDateRange(null), '', 'empty range');
  });

  test('zero values render as zero rather than blank or NaN', function(assert) {
    var days = span(10, {total_sessions: 1});
    var res = analyze(stats(days, {total_sessions: 10, total_utterances: 0, total_words: 0, words_per_utterance: 0}));

    assert.ok(res.hasReportData, 'sessions exist, so the report has data');
    var utterances = res.summaryMetrics.find(function(m) { return m.key === 'utterances'; });
    var wpu = res.summaryMetrics.find(function(m) { return m.key === 'words-per-utterance'; });
    assert.equal(utterances.formattedValue, '0', 'zero utterances');
    assert.equal(wpu.formattedValue, '0.0', 'zero words per utterance, one decimal');
    assert.equal(wpu.context, null, 'no words-per-utterance change without utterances');
  });

  test('missing optional metrics fall back to zero without breaking the shape', function(assert) {
    // A payload with only sessions — no words/utterances keys at all.
    var res = analyze(stats(span(8, {total_sessions: 1}), {total_sessions: 8}));

    assert.equal(res.summaryMetrics.length, 3, 'always exactly three KPIs');
    assert.deepEqual(
      res.summaryMetrics.map(function(m) { return m.key; }),
      ['sessions', 'utterances', 'words-per-utterance'],
      'KPI order is sessions, utterances, words per utterance'
    );
    res.summaryMetrics.forEach(function(metric) {
      assert.ok(typeof metric.formattedValue === 'string' && metric.formattedValue.length > 0, metric.key + ' formatted');
      assert.ok(['positive', 'negative', 'neutral'].indexOf(metric.tone) !== -1, metric.key + ' has a valid tone');
    });
    assert.equal(res.secondaryMetrics.length, 5, 'the five demoted values are still exposed');
  });

  test('words per utterance uses the utterance-weighted definition, matching the server', function(assert) {
    // Earlier half: 10 utterances at 2.0 wpu. Later half: 10 at 3.0 wpu.
    var days = span(8, function(idx) {
      return {total_sessions: 1, total_utterances: 5, total_words: 20, words_per_utterance: idx >= 4 ? 3 : 2};
    });
    var res = analyze(stats(days, {total_sessions: 8, total_utterances: 40, total_words: 160, words_per_utterance: 2.5}));

    var wpu = res.summaryMetrics.find(function(m) { return m.key === 'words-per-utterance'; });
    assert.equal(wpu.formattedValue, '2.5', 'KPI keeps the server-side period value');
    assert.equal(wpu.context, '+1.0', 'change is the weighted half-over-half delta');
    assert.equal(wpu.tone, 'positive', 'positive tone');

    var lengths = res.reportInsights.filter(function(i) { return i.key === 'message-length'; });
    assert.equal(lengths.length, 1, 'longer-messages insight surfaced');
    assert.equal(lengths[0].title, 'Longer messages', 'plain-language title');
  });

  test('insights are capped at three and only cover supported observations', function(assert) {
    var days = span(28, function(idx) {
      var later = idx >= 14;
      return {total_sessions: 1, total_utterances: later ? 30 : 10, total_words: later ? 90 : 20, words_per_utterance: later ? 3 : 2};
    });
    var res = analyze(stats(days, totalsFor(days)));

    assert.ok(res.reportInsights.length > 0, 'insights present');
    assert.ok(res.reportInsights.length <= 3, 'never more than three');
    res.reportInsights.forEach(function(insight) {
      assert.ok(insight.title && insight.description, 'insight is fully populated');
      assert.ok(insight.icon, 'insight names an icon');
      assert.ok(insight.description.indexOf('prompt') === -1, 'no prompting claims');
    });
  });

  test('a tapering-off insight carries the falling icon, not the rising one', function(assert) {
    // Regression lock: the momentum insight used to pass a single direction-less
    // icon name for both cases, which fell through to the rising-arrow fallback —
    // so "tapered off" rendered with an increase arrow.
    var falling = span(30, function(idx) {
      return {total_sessions: 1, total_utterances: idx < 10 ? 30 : 2, total_words: 4, words_per_utterance: 2};
    });
    var down = analyze(stats(falling, totalsFor(falling))).reportInsights.find(function(i) { return i.key === 'momentum'; });
    assert.equal(down.title, 'Communication tapered off in recent weeks', 'tapering headline');
    assert.equal(down.icon, 'trend-down', 'falling icon');

    var rising = span(30, function(idx) {
      return {total_sessions: 1, total_utterances: idx < 10 ? 2 : 30, total_words: 4, words_per_utterance: 2};
    });
    var up = analyze(stats(rising, totalsFor(rising))).reportInsights.find(function(i) { return i.key === 'momentum'; });
    assert.equal(up.title, 'Communication increased in recent weeks', 'rising headline');
    assert.equal(up.icon, 'trend-up', 'rising icon');
  });

  test('every insight icon has a real branch in the icon component', function(assert) {
    // Any name not listed here falls to the direction-less fallback; a direction
    // word in the title with a mismatched glyph is the failure mode being locked.
    var KNOWN = ['utterances', 'message-length', 'sessions', 'calendar', 'consistency', 'trend-up', 'trend-down', 'activity'];
    var days = span(28, function(idx) {
      var later = idx >= 14;
      return {total_sessions: 1, total_utterances: later ? 30 : 10, total_words: later ? 90 : 20, words_per_utterance: later ? 3 : 2};
    });
    var res = analyze(stats(days, totalsFor(days)));
    res.reportInsights.concat(res.summaryMetrics).forEach(function(item) {
      assert.ok(KNOWN.indexOf(item.icon) !== -1, item.key + ' uses a defined icon (' + item.icon + ')');
    });
  });

  test('trend switches to weekly buckets once a daily plot would be unreadable', function(assert) {
    var daily = analyze(stats(span(20, {total_sessions: 1, total_utterances: 4, total_words: 8}), {total_sessions: 20, total_utterances: 80}));
    assert.equal(daily.trend.granularity, 'day', 'short range stays daily');
    assert.equal(daily.trend.points.length, 20, 'one point per day');

    var days = span(42, {total_sessions: 1, total_utterances: 4, total_words: 8});
    var weekly = analyze(stats(days, {total_sessions: 42, total_utterances: 168}));
    assert.equal(weekly.trend.granularity, 'week', 'long range aggregates to weeks');
    assert.equal(weekly.trend.points.length, 6, 'six weekly buckets');
    assert.equal(weekly.trend.points[0].utterances, 28, 'weekly bucket sums its days');
  });

  test('a range that is not a whole number of weeks puts the short bucket FIRST', function(assert) {
    // 30 days = 4 whole weeks + 2. Bucketing forward from index 0 left the
    // remainder on the most recent point, so the chart ended on a 2-day sum
    // beside 7-day sums — a ~70% drop created purely by bucket width, which
    // reads as a collapse in recent activity.
    var days = span(30, {total_sessions: 1, total_utterances: 10, total_words: 20});
    var res = analyze(stats(days, {total_sessions: 30, total_utterances: 300}));
    var points = res.trend.points;

    assert.strictEqual(res.trend.granularity, 'week', 'long range aggregates to weeks');
    assert.strictEqual(points.length, 5, '2 leading days + four whole weeks');
    assert.strictEqual(points[0].days, 2, 'the short bucket is the FIRST one');
    assert.strictEqual(points[points.length - 1].days, 7, 'the most recent bucket is a whole week');
    assert.strictEqual(points[points.length - 1].utterances, 70, 'and sums a whole week of days');

    // Every bucket after the first covers the same span, so no step in the line
    // is an artefact of how the days were grouped.
    var tail = points.slice(1).map(function(p) { return p.days; });
    assert.deepEqual(tail, [7, 7, 7, 7], 'all remaining buckets are equal width');
  });
});
