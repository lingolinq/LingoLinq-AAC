// Share-of-total derivation for the Reports detail charts.
//
// Both Vocabulary Analysis breakdowns (Core vs. Fringe, Parts of Speech) are the
// same shape of question — "of everything counted, how much is each part?" — so
// the arithmetic and the rounding live here rather than in either component.
// Pure module, no Ember, no DOM: unit-testable without rendering.
//
// The stats payload arrives as a plain object of counts (`lib/stats.rb#
// parts_of_speech_stats`), but the same field read off an EmberObject can come
// back as one, so `plain` normalises either into a bare hash first.

function plain(counts) {
  if(!counts) { return {}; }
  if(typeof counts.get !== 'function') { return counts; }
  var res = {};
  Object.keys(counts).forEach(function(key) {
    // Ember's own bookkeeping keys are prefixed with `__`, and anything callable
    // is API surface rather than a count.
    if(key.indexOf('__') === 0 || typeof counts[key] === 'function') { return; }
    res[key] = counts.get(key);
  });
  return res;
}

function count_for(counts, key) {
  var obj = plain(counts);
  var val = parseInt(obj[key], 10);
  return isNaN(val) || val < 0 ? 0 : val;
}

// One decimal place, but only when it says something: 42.9% keeps its tenth,
// 7.0% renders as 7%. `percent` is 0-100, not a fraction.
function percent_label(percent) {
  var rounded = Math.round((percent || 0) * 10) / 10;
  return (rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)) + '%';
}

function percent_of(count, total) {
  return total > 0 ? (count / total) * 100 : 0;
}

// Every non-zero key becomes a row, ordered largest first (ties alphabetical so
// the order is stable across redraws). `percent` is the share of the TOTAL, and
// the caller draws each bar to exactly that width — a bar whose length disagreed
// with its own printed percentage would misread.
function from_counts(counts, options) {
  options = options || {};
  var label_for = options.label_for || function(key) { return key; };
  var obj = plain(counts);
  var rows = [];
  var total = 0;

  Object.keys(obj).forEach(function(key) {
    var count = count_for(obj, key);
    if(count === 0) { return; }
    total = total + count;
    rows.push({key: key, label: label_for(key), count: count});
  });

  rows.sort(function(a, b) {
    if(b.count !== a.count) { return b.count - a.count; }
    return a.label < b.label ? -1 : (a.label > b.label ? 1 : 0);
  });

  rows.forEach(function(row) {
    row.percent = percent_of(row.count, total);
    row.percent_label = percent_label(row.percent);
  });

  return {total: total, rows: rows};
}

export { plain, count_for, percent_label, percent_of, from_counts };
export default {plain: plain, count_for: count_for, percent_label: percent_label, percent_of: percent_of, from_counts: from_counts};
