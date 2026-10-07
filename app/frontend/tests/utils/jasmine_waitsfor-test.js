import QUnit from 'qunit';
import RSVP from 'rsvp';
import {
  describe,
  it,
  afterEach,
  expect,
  waitsFor,
  runs,
  stub,
  currentAssert,
  lateAssertionTesting
} from 'frontend/tests/helpers/jasmine';

// waitsFor(condition[, message][, timeoutMs]): a timeout the caller passes
// gives the condition at least that long, up to a cap a few seconds under
// QUnit's test timeout. Without one, the default budget in runs() applies
// (about 5 seconds).
describe('waitsFor timeout', function() {
  function trueAfter(ms) {
    var start = Date.now();
    return function() { return Date.now() - start >= ms; };
  }

  it('waits past the default budget when the caller passes a longer timeout', function() {
    var ready = trueAfter(6500);
    waitsFor(ready, 10000);
    runs(function() {
      expect(ready()).toEqual(true);
    });
  });

  it('accepts the timeout after a message argument', function() {
    var ready = trueAfter(6500);
    waitsFor(ready, 'too slow', 10000);
    runs(function() {
      expect(ready()).toEqual(true);
    });
  });

  it('keeps the default budget when the caller passes a shorter timeout', function() {
    var ready = trueAfter(1500);
    waitsFor(ready, 'too slow', 1000);
    runs(function() {
      expect(ready()).toEqual(true);
    });
  });

  // The wait's own failure is recorded as this test's result: it must come
  // from the harness, before QUnit's test timeout ends the test.
  it('fails a wait that never comes true on its own, before the test timeout', function() {
    var a = currentAssert();
    var push = a.pushResult;
    var start = Date.now();
    var limit = QUnit.config.testTimeout || 15000;
    stub(a, 'pushResult', function(result) {
      if(result && result.result === false && /^condition failed/.test(result.message)) {
        var elapsed = Date.now() - start;
        return push.call(a, { result: elapsed < limit, actual: elapsed, expected: '< ' + limit, message: 'the wait failed on its own after ' + elapsed + 'ms' });
      }
      return push.call(a, result);
    });
    waitsFor(function() { return false; }, 60000);
    runs(function() {});
  });
});

// When a test's pending work never finishes, the harness fails it and must still run the same
// cleanup as a normal end (afterEach hooks, stub restore), or one stuck test leaves its state to
// the tests after it and a single problem shows up as a cascade of failures.
describe('harness timeout cleanup', function() {
  var cleaned_up_after = [];
  var cleanup_seen_by_next_test = null;
  afterEach(function() {
    cleaned_up_after.push(currentAssert() ? currentAssert().test.testName : 'unknown');
  });

  it('a test whose returned promise never settles fails on its own', function() {
    var a = currentAssert();
    var push = a.pushResult;
    stub(a, 'pushResult', function(result) {
      if(result && result.result === false && /async work did not finish in time/.test(result.message)) {
        return push.call(a, { result: true, actual: result.message, expected: result.message, message: 'the harness failed the stuck test' });
      }
      return push.call(a, result);
    });
    return new RSVP.Promise(function() {});
  });

  it('runs that test\'s afterEach hooks before the next test starts', function() {
    cleanup_seen_by_next_test = cleaned_up_after.slice();
    expect(cleanup_seen_by_next_test.length).toEqual(1);
  });
});

// An expect() that runs after its test has ended throws a TypeError (no live assert). If the
// caller swallows that, the assertion would vanish; the harness records it and fails the next
// test instead.
describe('late assertion reporting', function() {
  it('records an expect() made after its test ended even when the error is swallowed', function() {
    var before = lateAssertionTesting.pending().length;
    lateAssertionTesting.withoutAssert(function() {
      try {
        expect('a late value').toEqual('a late value');
      } catch (e) {
        // swallowed, as an app-level catch or promise chain might
      }
    });
    var pending = lateAssertionTesting.pending();
    expect(pending.length).toEqual(before + 1);
    expect(/a late value/.test(pending[pending.length - 1])).toEqual(true);

    var reported = [];
    lateAssertionTesting.report({ ok: function(result, message) { reported.push([result, message]); } });
    expect(reported.length).toEqual(1);
    expect(reported[0][0]).toEqual(false);
    expect(/after its test had ended/.test(reported[0][1])).toEqual(true);
    expect(lateAssertionTesting.pending()).toEqual([]);
  });
  // Plain QUnit tests never go through the Jasmine-style wrappers, so the report also runs from a
  // global QUnit beforeEach hook; otherwise a late call followed only by plain tests (or by none
  // in a shard) would just be logged.
  it('reports a recorded late expect() from the global beforeEach hook, so plain QUnit tests catch it too', function() {
    lateAssertionTesting.withoutAssert(function() {
      try { expect('another late value').toEqual('x'); } catch (e) { /* swallowed */ }
    });
    var reported = [];
    var fake = { ok: function(result, message) { reported.push([result, message]); } };
    (QUnit.config.globalHooks.beforeEach || []).forEach(function(hook) { hook.call({}, fake); });
    expect(reported.length).toEqual(1);
    expect(reported[0][0]).toEqual(false);
    expect(/another late value/.test(reported[0][1])).toEqual(true);
    expect(lateAssertionTesting.pending()).toEqual([]);
  });
});
