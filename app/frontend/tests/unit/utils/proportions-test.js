import { module, test } from 'qunit';
import { plain, count_for, percent_label, percent_of, from_counts } from 'frontend/utils/proportions';

// Regression lock for the Reports Vocabulary Analysis breakdowns
// (utils/proportions.js). The rule the charts depend on is that a row's
// `percent` is the share the bar is drawn to — a mark that disagreed with the
// number printed beside it would misread — plus a stable order across redraws.

module('Unit | Utility | proportions', function() {
  test('plain passes a bare hash through untouched', function(assert) {
    var counts = {verb: 3, noun: 1};
    assert.strictEqual(plain(counts), counts);
    assert.deepEqual(plain(null), {});
  });

  test('plain unwraps an EmberObject-like value and drops its bookkeeping keys', function(assert) {
    var fake = {verb: 3, noun: 1, __ember_meta__: 'nope', get: function(k) { return this[k]; }};
    assert.deepEqual(plain(fake), {verb: 3, noun: 1});
  });

  test('count_for coerces and floors at zero', function(assert) {
    assert.strictEqual(count_for({core: '12'}, 'core'), 12);
    assert.strictEqual(count_for({core: -4}, 'core'), 0);
    assert.strictEqual(count_for({}, 'missing'), 0);
    assert.strictEqual(count_for(null, 'core'), 0);
  });

  test('percent_label keeps a meaningful tenth and drops a bare zero', function(assert) {
    assert.strictEqual(percent_label(42.857), '42.9%');
    assert.strictEqual(percent_label(7), '7%');
    assert.strictEqual(percent_label(7.04), '7%');
    assert.strictEqual(percent_label(0), '0%');
  });

  test('percent_of never divides by zero', function(assert) {
    assert.strictEqual(percent_of(5, 0), 0);
    assert.strictEqual(percent_of(1, 4), 25);
  });

  test('from_counts returns rows ordered largest first with shares of the total', function(assert) {
    var res = from_counts({verb: 6, noun: 3, adverb: 1});
    assert.strictEqual(res.total, 10);
    assert.deepEqual(res.rows.map(function(r) { return r.key; }), ['verb', 'noun', 'adverb']);
    assert.deepEqual(res.rows.map(function(r) { return r.percent; }), [60, 30, 10]);
    assert.deepEqual(res.rows.map(function(r) { return r.percent_label; }), ['60%', '30%', '10%']);
  });

  test('from_counts breaks ties alphabetically so redraws keep the same order', function(assert) {
    var res = from_counts({verb: 2, adverb: 2, noun: 2});
    assert.deepEqual(res.rows.map(function(r) { return r.key; }), ['adverb', 'noun', 'verb']);
  });

  test('from_counts drops zero and negative counts rather than drawing empty bars', function(assert) {
    var res = from_counts({verb: 4, noun: 0, adverb: -2});
    assert.strictEqual(res.total, 4);
    assert.deepEqual(res.rows.map(function(r) { return r.key; }), ['verb']);
  });

  test('from_counts on an empty payload yields no rows and no division by zero', function(assert) {
    var res = from_counts({});
    assert.strictEqual(res.total, 0);
    assert.deepEqual(res.rows, []);
  });

  test('from_counts labels rows through label_for and falls back to the raw key', function(assert) {
    var res = from_counts({verb: 2, sproing: 1}, {
      label_for: function(key) { return key === 'verb' ? 'Verb' : key; }
    });
    assert.deepEqual(res.rows.map(function(r) { return r.label; }), ['Verb', 'sproing']);
  });

  test('percentages of the rows sum to 100 for a whole payload', function(assert) {
    var res = from_counts({a: 1, b: 1, c: 1});
    var sum = res.rows.reduce(function(acc, r) { return acc + r.percent; }, 0);
    assert.ok(Math.abs(sum - 100) < 0.0001, 'shares add up to the whole');
  });
});
