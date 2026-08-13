/**
 * Derivation layer for the Reports page "Communication progress" summary.
 *
 * Pure functions over a `utils/stats.js` Stats object (or anything with a
 * compatible `get`). Nothing here touches the DOM, the router, or a service, so
 * the whole summary is unit-testable without rendering — see
 * `tests/unit/utils/report-summary-test.js`.
 *
 * DATA RULES BAKED IN HERE (verified against lib/stats.rb before writing):
 *   - The stats pipeline carries NO prompting or independence metric, so no
 *     insight may ever claim communication became "more independent" or that
 *     prompts changed. `modeled_*` is partner modeling, not prompting.
 *   - There is no previous-period payload in single-period mode (`usage_stats2`
 *     exists only in explicit compare mode). The comparison here is therefore
 *     the LATER HALF of the selected range against its EARLIER HALF, and every
 *     string that reports a change names the earlier half's dates so the claim
 *     is exact rather than implying a previous report period.
 *   - KPI values are read straight off the top-level stats fields, so each
 *     metric keeps the meaning and calculation it already had.
 */
import i18n from './i18n';
import templateHelpers from './template_helpers';

// Change smaller than this reads as noise, not progress.
var PERCENT_DEAD_BAND = 5;
var WPU_DEAD_BAND = 0.2;
// Below this many events in the baseline half, a percentage is misleading —
// report the absolute change instead.
var MIN_BASE_FOR_PERCENT = 5;
// Longer ranges are aggregated to weeks so the trend stays readable.
var MAX_DAILY_POINTS = 28;

function num(val) {
  var parsed = parseFloat(val);
  return (typeof parsed === 'number' && isFinite(parsed)) ? parsed : 0;
}

function read(stats, key) {
  if(!stats) { return undefined; }
  if(typeof stats.get === 'function') { return stats.get(key); }
  return stats[key];
}

function count(stats, key) {
  return num(read(stats, key));
}

/** Whole numbers with thousands separators; `delimit` is registered by i18n.js. */
function formatCount(val) {
  if(typeof templateHelpers.delimit === 'function') {
    return templateHelpers.delimit(Math.round(num(val)));
  }
  return String(Math.round(num(val)));
}

/** One decimal place — the default precision for every derived rate here. */
function formatDecimal(val) {
  return (Math.round(num(val) * 10) / 10).toFixed(1);
}

function formatDay(day) {
  if(!day) { return ''; }
  return templateHelpers.date(day, 'tiny_day');
}

/**
 * Sorted per-day rows. `days_sorted` on the Stats object already sorts and
 * stamps `day`; plain objects (tests, cached payloads) are handled too.
 */
function dayRows(stats) {
  var sorted = read(stats, 'days_sorted');
  if(sorted && sorted.length !== undefined) { return [].slice.call(sorted); }
  var days = read(stats, 'days') || {};
  var rows = Object.keys(days).map(function(day) {
    var row = days[day] || {};
    row.day = day;
    return row;
  });
  return rows.sort(function(a, b) { return String(a.day).localeCompare(String(b.day)); });
}

function sumRows(rows, key) {
  return rows.reduce(function(total, row) { return total + num(row[key]); }, 0);
}

/**
 * Words per utterance for a set of days, using the SAME definition the server
 * uses for the period total (utterance words / utterances, lib/stats.rb:550).
 * Per-day `words_per_utterance` is that ratio for the day, so multiplying it
 * back out by the day's utterances recovers the day's utterance words exactly.
 */
function wordsPerUtterance(rows) {
  var utterances = sumRows(rows, 'total_utterances');
  if(utterances <= 0) { return null; }
  var words = rows.reduce(function(total, row) {
    return total + (num(row['words_per_utterance']) * num(row['total_utterances']));
  }, 0);
  return words / utterances;
}

function percentChange(later, earlier) {
  if(earlier <= 0) { return null; }
  return (later - earlier) / earlier * 100;
}

// Inclusive band: a change of exactly the band width is still called steady.
// Progress claims about a communicator's data should err toward under-claiming.
function toneForPercent(pct) {
  if(pct === null || Math.abs(pct) <= PERCENT_DEAD_BAND) { return 'neutral'; }
  return pct > 0 ? 'positive' : 'negative';
}

/**
 * Later half vs earlier half of the selected range. `available` is false unless
 * the range is long enough to split and the earlier half actually recorded
 * something to compare against.
 */
function buildComparison(rows) {
  var unavailable = { available: false };
  if(rows.length < 4) { return unavailable; }
  var mid = Math.floor(rows.length / 2);
  var earlier = rows.slice(0, mid);
  var later = rows.slice(mid);
  if(sumRows(earlier, 'total_sessions') <= 0) { return unavailable; }

  return {
    available: true,
    label: formatDay(earlier[0].day) + ' – ' + formatDay(earlier[earlier.length - 1].day),
    later_label: formatDay(later[0].day) + ' – ' + formatDay(later[later.length - 1].day),
    earlier: {
      utterances: sumRows(earlier, 'total_utterances'),
      sessions: sumRows(earlier, 'total_sessions'),
      words: sumRows(earlier, 'total_words'),
      words_per_utterance: wordsPerUtterance(earlier)
    },
    later: {
      utterances: sumRows(later, 'total_utterances'),
      sessions: sumRows(later, 'total_sessions'),
      words: sumRows(later, 'total_words'),
      words_per_utterance: wordsPerUtterance(later)
    }
  };
}

/**
 * Visible caption under every change chip: names the DIRECTION in words, so the
 * arrow and its color are never the only thing carrying it. The dates behind the
 * comparison are stated once for the whole row (see `comparisonBasis`).
 */
function toneLabel(tone) {
  if(tone === 'positive') { return i18n.t('report_change_increase', "Increase"); }
  if(tone === 'negative') { return i18n.t('report_change_decrease', "Decrease"); }
  return i18n.t('report_change_no_change', "No change");
}

/**
 * Context string for a KPI: a percentage when the baseline is big enough for one
 * to mean anything, otherwise the absolute change. Returns null when there is
 * nothing honest to say.
 */
function countChange(comparison, key, label) {
  if(!comparison.available) { return null; }
  var earlier = comparison.earlier[key];
  var later = comparison.later[key];
  var delta = later - earlier;
  if(earlier >= MIN_BASE_FOR_PERCENT) {
    var pct = percentChange(later, earlier);
    var tone = toneForPercent(pct);
    var rounded = Math.abs(Math.round(pct));
    if(tone === 'neutral') {
      return {
        tone: 'neutral',
        context: i18n.t('report_change_steady', "steady"),
        contextLabel: toneLabel('neutral'),
        accessibleContext: i18n.t('report_change_steady_full', "%{label}: about the same as %{range}", {label: label, range: comparison.label})
      };
    }
    return {
      tone: tone,
      context: (tone === 'positive' ? '↑ ' : '↓ ') + rounded + '%',
      contextLabel: toneLabel(tone),
      accessibleContext: tone === 'positive' ?
        i18n.t('report_change_up_pct', "%{label} up %{pct} percent compared with %{range}", {label: label, pct: rounded, range: comparison.label}) :
        i18n.t('report_change_down_pct', "%{label} down %{pct} percent compared with %{range}", {label: label, pct: rounded, range: comparison.label})
    };
  }
  if(Math.round(delta) === 0) { return null; }
  var up = delta > 0;
  return {
    tone: up ? 'positive' : 'negative',
    context: (up ? '+' : '−') + formatCount(Math.abs(delta)),
    contextLabel: toneLabel(up ? 'positive' : 'negative'),
    accessibleContext: up ?
      i18n.t('report_change_up_count', "%{label} up %{num} compared with %{range}", {label: label, num: formatCount(Math.abs(delta)), range: comparison.label}) :
      i18n.t('report_change_down_count', "%{label} down %{num} compared with %{range}", {label: label, num: formatCount(Math.abs(delta)), range: comparison.label})
  };
}

function wpuChange(comparison, label) {
  if(!comparison.available) { return null; }
  var earlier = comparison.earlier.words_per_utterance;
  var later = comparison.later.words_per_utterance;
  if(earlier === null || later === null) { return null; }
  var delta = later - earlier;
  if(Math.abs(delta) < WPU_DEAD_BAND) {
    return {
      tone: 'neutral',
      context: i18n.t('report_change_steady', "steady"),
      contextLabel: toneLabel('neutral'),
      accessibleContext: i18n.t('report_change_steady_full', "%{label}: about the same as %{range}", {label: label, range: comparison.label})
    };
  }
  var up = delta > 0;
  return {
    tone: up ? 'positive' : 'negative',
    context: (up ? '+' : '−') + formatDecimal(Math.abs(delta)),
    contextLabel: toneLabel(up ? 'positive' : 'negative'),
    accessibleContext: up ?
      i18n.t('report_change_up_count', "%{label} up %{num} compared with %{range}", {label: label, num: formatDecimal(Math.abs(delta)), range: comparison.label}) :
      i18n.t('report_change_down_count', "%{label} down %{num} compared with %{range}", {label: label, num: formatDecimal(Math.abs(delta)), range: comparison.label})
  };
}

function buildPrimaryInsight(stats, comparison) {
  var utterances = count(stats, 'total_utterances');
  var sessions = count(stats, 'total_sessions');
  var snapshot = {
    title: i18n.t('report_primary_snapshot', "%{utterances} utterances across %{sessions} sessions", {utterances: formatCount(utterances), sessions: formatCount(sessions)}),
    description: i18n.t('report_primary_snapshot_desc', "Here is a snapshot of communication activity for this period."),
    tone: 'neutral'
  };
  if(!comparison.available) { return snapshot; }

  var pct = percentChange(comparison.later.utterances, comparison.earlier.utterances);
  var tone = toneForPercent(pct);
  if(tone === 'positive') {
    return {
      title: i18n.t('report_primary_up', "Communication increased this period"),
      description: i18n.t('report_primary_up_desc', "%{utterances} utterances across %{sessions} sessions—%{pct}% more in the later half of this period than in %{range}.", {utterances: formatCount(utterances), sessions: formatCount(sessions), pct: Math.abs(Math.round(pct)), range: comparison.label}),
      tone: 'positive'
    };
  } else if(tone === 'negative') {
    return {
      title: i18n.t('report_primary_down', "Communication was lower this period"),
      description: i18n.t('report_primary_down_desc', "Usage decreased from %{range}. Review the weekly pattern for more context.", {range: comparison.label}),
      tone: 'negative'
    };
  }
  return {
    title: i18n.t('report_primary_steady', "Communication stayed steady this period"),
    description: i18n.t('report_primary_steady_desc', "%{utterances} utterances across %{sessions} sessions—about the same as %{range}.", {utterances: formatCount(utterances), sessions: formatCount(sessions), range: comparison.label}),
    tone: 'neutral'
  };
}

function buildSummaryMetrics(stats, comparison) {
  var utterance_label = i18n.t('report_kpi_utterances', "Utterances");
  var wpu_label = i18n.t('report_kpi_words_per_utterance', "Words per utterance");
  var session_label = i18n.t('report_kpi_sessions', "Sessions");
  // Order is Sessions → Utterances → Words per utterance. Each metric keeps its
  // own key, so its icon tint travels with it rather than with the slot.
  var metrics = [
    {key: 'sessions', label: session_label, icon: 'sessions', formattedValue: formatCount(count(stats, 'total_sessions')), change: countChange(comparison, 'sessions', session_label)},
    {key: 'utterances', label: utterance_label, icon: 'utterances', formattedValue: formatCount(count(stats, 'total_utterances')), change: countChange(comparison, 'utterances', utterance_label)},
    {key: 'words-per-utterance', label: wpu_label, icon: 'message-length', formattedValue: formatDecimal(count(stats, 'words_per_utterance')), change: wpuChange(comparison, wpu_label)}
  ];
  return metrics.map(function(metric) {
    var change = metric.change;
    delete metric.change;
    metric.context = change ? change.context : null;
    metric.contextLabel = change ? change.contextLabel : null;
    metric.accessibleContext = change ? change.accessibleContext : '';
    metric.tone = change ? change.tone : 'neutral';
    return metric;
  });
}

var WEEKDAY_NAMES = function() {
  return [
    i18n.t('sundays', "Sundays"),
    i18n.t('mondays', "Mondays"),
    i18n.t('tuesdays', "Tuesdays"),
    i18n.t('wednesdays', "Wednesdays"),
    i18n.t('thursdays', "Thursdays"),
    i18n.t('fridays', "Fridays"),
    i18n.t('saturdays', "Saturdays")
  ];
};

/** Busiest weekday, but only when the range covers it enough times to mean it. */
function busiestWeekday(rows) {
  if(rows.length < 14) { return null; }
  var totals = [0, 0, 0, 0, 0, 0, 0];
  var occurrences = [0, 0, 0, 0, 0, 0, 0];
  rows.forEach(function(row) {
    var parts = String(row.day).split('-');
    if(parts.length !== 3) { return; }
    var date = new Date(Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)));
    if(isNaN(date.getTime())) { return; }
    var wday = date.getUTCDay();
    totals[wday] += num(row['total_utterances']);
    occurrences[wday] += 1;
  });
  var overall = totals.reduce(function(a, b) { return a + b; }, 0);
  if(overall <= 0) { return null; }
  var best = -1;
  var best_avg = 0;
  var averages = [];
  for(var i = 0; i < 7; i++) {
    var avg = occurrences[i] >= 2 ? (totals[i] / occurrences[i]) : null;
    averages.push(avg);
    if(avg !== null && avg > best_avg) { best_avg = avg; best = i; }
  }
  if(best === -1) { return null; }
  var present = averages.filter(function(avg) { return avg !== null; });
  if(present.length < 3) { return null; }
  var mean = present.reduce(function(a, b) { return a + b; }, 0) / present.length;
  if(mean <= 0 || best_avg < mean * 1.5) { return null; }
  return {wday: best, average: best_avg};
}

function buildInsights(stats, comparison, rows) {
  var insights = [];

  if(comparison.available) {
    var earlier_wpu = comparison.earlier.words_per_utterance;
    var later_wpu = comparison.later.words_per_utterance;
    if(earlier_wpu !== null && later_wpu !== null && Math.abs(later_wpu - earlier_wpu) >= WPU_DEAD_BAND) {
      var longer = later_wpu > earlier_wpu;
      insights.push({
        key: 'message-length',
        icon: 'message-length',
        title: longer ? i18n.t('report_insight_longer', "Longer messages") : i18n.t('report_insight_shorter', "Shorter messages"),
        description: i18n.t('report_insight_message_length_desc', "%{later} words per utterance in the later half of this period, compared with %{earlier} in %{range}.", {later: formatDecimal(later_wpu), earlier: formatDecimal(earlier_wpu), range: comparison.label})
      });
    }
  }

  var busiest = busiestWeekday(rows);
  if(busiest) {
    insights.push({
      key: 'busiest-day',
      icon: 'calendar',
      title: i18n.t('report_insight_busiest_day', "Most active on %{day}", {day: WEEKDAY_NAMES()[busiest.wday]}),
      description: i18n.t('report_insight_busiest_day_desc', "%{num} utterances on an average %{day_singular} — more than any other day of the week.", {num: formatDecimal(busiest.average), day_singular: WEEKDAY_NAMES()[busiest.wday]})
    });
  }

  if(rows.length >= 9) {
    var third = Math.floor(rows.length / 3);
    var first_third = sumRows(rows.slice(0, third), 'total_utterances');
    var last_third = sumRows(rows.slice(rows.length - third), 'total_utterances');
    var momentum = percentChange(last_third, first_third);
    if(momentum !== null && Math.abs(momentum) >= 15) {
      insights.push({
        key: 'momentum',
        // Direction-specific: a tapering-off insight must not carry a rising arrow.
        icon: momentum > 0 ? 'trend-up' : 'trend-down',
        title: momentum > 0 ? i18n.t('report_insight_recent_up', "Communication increased in recent weeks") : i18n.t('report_insight_recent_down', "Communication tapered off in recent weeks"),
        description: i18n.t('report_insight_recent_desc', "%{later} utterances in the last %{days} days, compared with %{earlier} in the first %{days} days of this period.", {later: formatCount(last_third), earlier: formatCount(first_third), days: third})
      });
    }
  }

  if(rows.length >= 7) {
    var active = rows.filter(function(row) { return num(row['total_sessions']) > 0; }).length;
    if(active > 0 && (active / rows.length) >= 0.6) {
      insights.push({
        key: 'consistency',
        icon: 'consistency',
        title: i18n.t('report_insight_consistent', "Usage was consistent"),
        description: i18n.t('report_insight_consistent_desc', "Communication was recorded on %{active} of %{total} days in this period.", {active: formatCount(active), total: formatCount(rows.length)})
      });
    }
  }

  return insights.slice(0, 3);
}

/**
 * Trend series for the chart: utterances (primary) and words (secondary), by day
 * for short ranges and by week once a daily plot would be unreadable.
 */
function buildTrend(rows) {
  var populated = rows.length > 0;
  if(!populated) { return {available: false, granularity: 'day', points: []}; }

  if(rows.length <= MAX_DAILY_POINTS) {
    return {
      available: true,
      granularity: 'day',
      points: rows.map(function(row) {
        return {
          key: row.day,
          label: formatDay(row.day),
          utterances: num(row['total_utterances']),
          words: num(row['total_words'])
        };
      })
    };
  }

  var buckets = [];
  var current = null;
  rows.forEach(function(row, idx) {
    if(idx % 7 === 0) {
      current = {key: row.day, label: formatDay(row.day), utterances: 0, words: 0};
      buckets.push(current);
    }
    current.utterances += num(row['total_utterances']);
    current.words += num(row['total_words']);
  });
  return {available: true, granularity: 'week', points: buckets};
}

/**
 * The eight side-by-side figures shown for each period in compare mode. Same
 * metrics, same order and same source fields the old Bootstrap panels used —
 * only the presentation changed — with decimals normalised to the one place the
 * rest of the report uses.
 */
export function comparePanelMetrics(stats) {
  if(!stats) { return []; }
  return [
    {key: 'total-sessions', label: i18n.t('total_sessions', "Total Sessions"), icon: 'sessions', formattedValue: formatCount(count(stats, 'total_sessions'))},
    {key: 'total-words', label: i18n.t('total_words', "Total Words"), icon: 'words', formattedValue: formatCount(count(stats, 'total_words'))},
    {key: 'total-utterances', label: i18n.t('total_utterances', "Total utterances"), icon: 'utterances', formattedValue: formatCount(count(stats, 'total_utterances'))},
    {key: 'total-buttons', label: i18n.t('total_buttons', "Total Buttons"), icon: 'buttons', formattedValue: formatCount(count(stats, 'total_buttons'))},
    {key: 'words-per-utterance', label: i18n.t('words_per_utterance', "Words per utterance"), icon: 'message-length', formattedValue: formatDecimal(count(stats, 'words_per_utterance'))},
    {key: 'words-per-minute', label: i18n.t('words_per_minute', "Words per minute"), icon: 'rate', formattedValue: formatDecimal(count(stats, 'words_per_minute'))},
    {key: 'utterances-per-minute', label: i18n.t('utterances_per_minute', "Utterances per minute"), icon: 'rate', formattedValue: formatDecimal(count(stats, 'utterances_per_minute'))},
    {key: 'buttons-per-minute', label: i18n.t('buttons_per_minute', "Buttons per minute"), icon: 'rate', formattedValue: formatDecimal(count(stats, 'buttons_per_minute'))}
  ];
}

function buildSecondaryMetrics(stats) {
  return [
    {key: 'total-words', label: i18n.t('total_words', "Total Words"), formattedValue: formatCount(count(stats, 'total_words'))},
    {key: 'total-buttons', label: i18n.t('total_buttons', "Total Buttons"), formattedValue: formatCount(count(stats, 'total_buttons'))},
    {key: 'words-per-minute', label: i18n.t('words_per_minute', "Words per minute"), formattedValue: formatDecimal(count(stats, 'words_per_minute'))},
    {key: 'utterances-per-minute', label: i18n.t('utterances_per_minute', "Utterances per minute"), formattedValue: formatDecimal(count(stats, 'utterances_per_minute'))},
    {key: 'buttons-per-minute', label: i18n.t('buttons_per_minute', "Buttons per minute"), formattedValue: formatDecimal(count(stats, 'buttons_per_minute'))}
  ];
}

/** Selected range, from the dates the report actually covers. */
export function formattedDateRange(stats) {
  if(!stats) { return ''; }
  var start = read(stats, 'start_date_field') || read(stats, 'start');
  var end = read(stats, 'end_date_field') || read(stats, 'end');
  if(!start || !end) { return ''; }
  return formatDay(start) + ' – ' + formatDay(end);
}

/**
 * The whole summary in one pass. Returns a stable shape even with no stats, so
 * the template never has to guard individual fields.
 */
export function analyze(stats) {
  var has_data = !!(stats && read(stats, 'has_data'));
  if(!has_data) {
    return {
      hasReportData: false,
      formattedDateRange: formattedDateRange(stats),
      comparisonAvailable: false,
      comparisonPeriodLabel: '',
      comparisonBasis: '',
      primaryInsight: null,
      summaryMetrics: [],
      reportInsights: [],
      hasInsights: false,
      secondaryMetrics: [],
      trend: {available: false, granularity: 'day', points: []}
    };
  }

  var rows = dayRows(stats);
  var comparison = buildComparison(rows);
  var insights = buildInsights(stats, comparison, rows);

  return {
    hasReportData: true,
    formattedDateRange: formattedDateRange(stats),
    comparisonAvailable: comparison.available,
    comparisonPeriodLabel: comparison.label || '',
    // Spelled out under the KPI row so the arrows are never unexplained: every
    // change on this page is the later half of the selected range measured
    // against its earlier half, both named by their actual dates.
    comparisonBasis: comparison.available ? i18n.t(
      'report_comparison_basis',
      "Every change below compares the later half of the selected period (%{later}) with its earlier half (%{earlier}).",
      {later: comparison.later_label, earlier: comparison.label}
    ) : '',
    primaryInsight: buildPrimaryInsight(stats, comparison),
    summaryMetrics: buildSummaryMetrics(stats, comparison),
    reportInsights: insights,
    hasInsights: insights.length > 0,
    secondaryMetrics: buildSecondaryMetrics(stats),
    trend: buildTrend(rows)
  };
}

export default { analyze: analyze, formattedDateRange: formattedDateRange, comparePanelMetrics: comparePanelMetrics };
