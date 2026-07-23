import { module, test } from 'qunit';
import EmberObject, { computed, get, set } from '@ember/object';
import { A } from '@ember/array';
import { buildWaiter, hasPendingWaiters } from '@ember/test-waiters';
import RSVP from 'rsvp';

// Regression coverage for the Ember 3.28 -> 5.12 upgrade fix classes
// (docs/ember-5.12-migration-findings.md). These lock in the framework-behavior
// contracts the migration fixes depend on, so a re-introduction of the bug class
// (or a re-enable of EXTEND_PROTOTYPES) fails a test instead of silently shipping.
// Tracks LL-e5ecce96ee.
module('Unit | Ember 5.12 migration regression', function() {

  // --- Class 1: array prototype extensions are OFF (EXTEND_PROTOTYPES:false) ---
  // The migration replaced sortBy/mapBy/uniq/compact/pushObject on *native* arrays
  // with native equivalents because those Ember methods no longer exist on `[]`.
  // If EXTEND_PROTOTYPES were ever re-enabled they would reappear and mask
  // regressions, so assert the invariant the whole Class-1 fix set relies on.
  module('Class 1 — native arrays have no Ember array-extension methods', function() {
    test('sortBy / mapBy / uniq / compact / pushObject are absent on native []', function(assert) {
      var arr = [3, 1, 2];
      assert.strictEqual(typeof arr.sortBy, 'undefined', 'no sortBy on native array');
      assert.strictEqual(typeof arr.mapBy, 'undefined', 'no mapBy on native array');
      assert.strictEqual(typeof arr.uniq, 'undefined', 'no uniq on native array');
      assert.strictEqual(typeof arr.compact, 'undefined', 'no compact on native array');
      assert.strictEqual(typeof arr.pushObject, 'undefined', 'no pushObject on native array');
    });

    test('the native replacements reproduce the old Ember behavior', function(assert) {
      // sortBy('n') -> slice().sort(comparator), source left unmutated
      var items = [{ n: 3 }, { n: 1 }, { n: 2 }];
      var sorted = items.slice().sort(function(a, b) { return a.n - b.n; });
      assert.deepEqual(sorted.map(function(i) { return i.n; }), [1, 2, 3], 'native sort matches sortBy order');
      assert.deepEqual(items.map(function(i) { return i.n; }), [3, 1, 2], 'slice() left the source unmutated');
      // uniq() -> [...new Set()]
      assert.deepEqual([...new Set([1, 1, 2, 3, 3])], [1, 2, 3], 'Set dedup matches uniq');
      // compact() -> filter(x => x != null) (keeps 0 / false / "" like Ember's compact)
      assert.deepEqual([0, null, false, undefined, ''].filter(function(x) { return x != null; }), [0, false, ''], 'filter matches compact (drops only null/undefined)');
    });
  });

  // --- Class 2: @each reactivity over an A()-wrapped array ---
  // The Class 2 fixes (controllers/user/preferences.js:346 skin-tone save,
  // controllers/inflections.js:171 word_types) return A(...) at the assignment
  // site so a computed/observer on `...@each.checked` refires when an element's
  // `checked` is toggled in place. This locks in that contract for the FIX's
  // shape: an A()-wrapped array recomputes on in-place element mutation.
  //
  // NOTE (honest scope): a synthetic *native*-array counter-example is NOT a
  // faithful reproduction of the production bug — empirically Ember 5.12 still
  // fires `@each` for EmberObject elements set() in place even on a raw array, so
  // the native-array staleness only manifests under the real controllers' build
  // path (array of records, emberSet, no wholesale re-set). Controller-level
  // integration coverage of preferences/inflections is the follow-up for this
  // finding; this unit test guards only the A()-array reactivity the fix relies on.
  module('Class 2 — @each reactivity over an A()-wrapped array', function() {
    test('an in-place toggle refires a computed keyed on options.@each.checked', function(assert) {
      var options = A([EmberObject.create({ checked: false }), EmberObject.create({ checked: false })]);
      var subject = EmberObject.extend({
        checkedCount: computed('options.@each.checked', function() {
          return (this.get('options') || []).filter(function(o) { return get(o, 'checked'); }).length;
        })
      }).create({ options: options });

      assert.strictEqual(subject.get('checkedCount'), 0, 'initial count is 0');
      set(subject.get('options').objectAt(0), 'checked', true);
      assert.strictEqual(subject.get('checkedCount'), 1, 'in-place toggle recomputed via @each');
    });
  });

  // --- @ember/test-waiters adoption pattern (LL-e5ecce96ee) ---
  // The finding calls for wrapping fetch-heavy async (persistence.sync, speecher)
  // in waiters so settled() blocks on it. Instrumenting those production hotspots
  // is a deliberate follow-up; this test proves the dependency is wired and locks
  // in the begin/end pattern that instrumentation will use.
  module('test-waiters — a registered waiter tracks in-flight async', function() {
    test('hasPendingWaiters flips true while pending and clears on completion', async function(assert) {
      var waiter = buildWaiter('ember-5-12-regression:demo');
      var release;
      var promise = new RSVP.Promise(function(resolve) { release = resolve; });
      var token = waiter.beginAsync();
      assert.true(hasPendingWaiters(), 'waiter is pending while the promise is in flight');
      release();
      await promise;
      waiter.endAsync(token);
      assert.false(hasPendingWaiters(), 'waiter cleared once the async work settled');
    });
  });
});
