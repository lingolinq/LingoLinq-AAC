import { module, test } from 'qunit';
import { and } from 'frontend/helpers/and';
import { not } from 'frontend/helpers/not';

module('Unit | Helper | truth helpers', function() {
  test('and requires every argument to be truthy', function(assert) {
    assert.equal(and([true, true]), true);
    assert.equal(and([true, false]), false);
    assert.equal(and([false, true]), false);
  });

  // Regression: the previous `function([a, b])` form ignored every argument
  // past the second, so (and a b c) evaluated as `a && b`. Three call sites
  // in the app pass three arguments and were silently dropping the third.
  test('and does not ignore arguments past the second', function(assert) {
    assert.equal(and([true, true, false]), false);
    assert.equal(and([true, true, true]), true);
    assert.equal(and([true, true, true, false]), false);
  });

  test('and coerces truthiness rather than returning a value', function(assert) {
    assert.equal(and(['a', 'b']), true);
    assert.equal(and(['a', '']), false);
    assert.equal(and([1, 0]), false);
  });

  test('not negates a single argument', function(assert) {
    assert.equal(not([false]), true);
    assert.equal(not([true]), false);
    assert.equal(not([null]), true);
    assert.equal(not(['']), true);
    assert.equal(not(['a']), false);
  });

  // Same guard as `and`: written variadically so extra arguments can never be
  // silently discarded. True only when every argument is falsy.
  test('not stays variadic', function(assert) {
    assert.equal(not([false, false]), true);
    assert.equal(not([false, true]), false);
    assert.equal(not([true, false]), false);
  });
});
