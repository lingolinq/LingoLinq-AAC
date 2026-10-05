import QUnit from 'qunit';
import {
  describe,
  it,
  expect,
  waitsFor,
  runs,
  stub,
  currentAssert
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
