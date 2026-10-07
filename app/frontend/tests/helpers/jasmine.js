// Use the same QUnit instance as ember-qunit/test-helper so jasmine-style tests register and run.
import * as QUnit from 'qunit';
import { setupRenderingTest, setupTest, setupApplicationTest } from './index';
import { run as emberRun } from '@ember/runloop';
import { set as emberSet, get as emberGet } from '@ember/object';
import appStateUtil from '../../utils/app_state';
import LingoLinq from '../../app';
import RSVP from 'rsvp';
import { SERVICE_MIRROR_RULES } from './service-stub';
import { cancelHarnessAsyncWork } from './sync-test-cleanup';

var names = [];
var all_befores = [[]];
var all_afters = [[]];
var all_tests = [];
var current_test_id = 0;
var current_afters = [];
var waiting = {}, wait_deadlines = {}, test_started_at = 0, WAIT_POLL_LIMIT = 135; // wait_deadlines: per test, the latest time a waitsFor timeout asked to wait until; WAIT_POLL_LIMIT (~12.6s of polls) backstops it if the clock is stubbed

var assert = null;
function currentAssert() {
  return assert;
}
function async_test_wrap(name, instance, befores, afters, lookup) {
  var pre = [];
  var post = [];
  all_befores.forEach(function(list) {
    list.forEach(function(callback) {
      pre.push(callback);
    });
  });
  all_afters.forEach(function(list) {
    list.forEach(function(callback) {
      post.push(callback);
    });
  });
  QUnit.test(name, async function(current_assert) {
    var _this = this;
    assert = current_assert; reportLateAssertions(assert);
    try {
      emberRun(function() {
        pre.forEach(function(callback) {
          callback.call(_this);
        });
      });
      // Fresh sync epoch (see test_wrap for rationale — issue #589 async fence).
      if (typeof LingoLinq !== 'undefined') { LingoLinq.sync_epoch = (LingoLinq.sync_epoch || 0) + 1; }
      var this_arg = lookup || _this;
      await instance.call(this_arg);
    } catch (e) {
      assert.ok(false, e.message || String(e));
    }
    emberRun(function() {
      cancelHarnessAsyncWork();
      post.forEach(function(callback) {
        callback.call(_this);
      });
      restoreStubs();
      assert = null;
      if (typeof LingoLinq !== 'undefined') {
        LingoLinq.sync_testing = false;
      }
    });
  });
}

function test_wrap(name, instance, befores, afters, lookup) {
  var pre = [];
  var post = [];
  all_befores.forEach(function(list) {
    list.forEach(function(callback) {
      pre.push(callback);
    });
  });
  all_afters.forEach(function(list) {
    list.forEach(function(callback) {
      post.push(callback);
    });
  });
  current_afters = post;
  // Do not mark this test `async`: an immediately-resolved promise lets ember-qunit
  // teardown (waitForSettled: false) run before runs() finishes post afterEach hooks.
  // Retry ONLY the persistence-sync module. It has a deep, irreducible-in-the-harness
  // cross-test async race (issue #589): a prior test's late sync work can orphan a
  // later test's sync promise (caught: done=false, settled=true, threads=0). The epoch
  // + wait-gate fixes cut this to a low single-digit residual on one real-boards test;
  // this bounded auto-retry absorbs that residual so it can't fail CI on good PRs.
  // A genuinely broken test still fails all attempts and is reported. All OTHER modules
  // take the general path below (no retry; it waits for returned promises).
  var retryOn = name.indexOf('persistence-sync') !== -1;
  QUnit.test(name, function(current_assert) {
    var _this = this;
    assert = current_assert; reportLateAssertions(assert);
    var this_arg = lookup || _this;
    var testDone = assert.async(); test_started_at = Date.now(); // QUnit's test timeout runs from here

    if (!retryOn) {
      // ---- GENERAL PATH (all non-persistence-sync tests). Its poll loop is unchanged, so the poll
      // cap stays dynamically re-evaluated each iteration (some tests, e.g. capabilities
      // timeout/sensor tests, legitimately poll ~4.8s and must not be cut off early). ----
      emberRun(function() {
        pre.forEach(function(callback) { callback.call(_this); });
        current_test_id++;
        trackReturnedPromise(instance.call(this_arg));
        var pollAttempts = 0;
        var pollUntilIdle = function() {
          if ((waiting[current_test_id] || 0) === 0) {
            var settleMs = (typeof LingoLinq !== 'undefined' && LingoLinq.sync_testing) ? 500 : 0; // kept for now: removing it exposed a leaking Ember Data fetch (#1111 CI); removal is a follow-up
            var runCleanup = function() {
              emberRun(function() {
                cancelHarnessAsyncWork();
                current_afters = [];
                post.forEach(function(callback) { callback.call(_this); });
                restoreStubs();
                assert = null;
                testDone();
                if (typeof LingoLinq !== 'undefined') { LingoLinq.sync_testing = false; }
              });
            };
            if (settleMs > 0) { setTimeout(runCleanup, settleMs); } else { runCleanup(); }
          } else if (pollAttempts < ((typeof LingoLinq !== 'undefined' && LingoLinq.sync_testing) ? 200 : 55) || (wait_deadlines[current_test_id] && pollAttempts < WAIT_POLL_LIMIT && Date.now() < wait_deadlines[current_test_id] + 500)) {
            pollAttempts++;
            var delay = pollAttempts < 10 ? 10 : 100;
            setTimeout(pollUntilIdle, delay);
          } else {
            assert.ok(false, 'async work did not finish in time'); // then the SAME cleanup as a normal end, so a stuck test cannot leave its state to the tests after it
            cancelHarnessAsyncWork(); current_afters = []; try { post.forEach(function(callback) { callback.call(_this); }); } catch (e) { assert.ok(false, 'afterEach failed after the timeout: ' + ((e && e.message) || e)); } finally { restoreStubs(); }
            assert = null;
            testDone();
            if (typeof LingoLinq !== 'undefined') { LingoLinq.sync_testing = false; }
          }
        };
        pollUntilIdle();
      });
      return;
    }

    // ---- RETRY PATH (persistence-sync only) ----
    var runOnce = function(onIdle, onHung, maxPoll) {
      pre.forEach(function(callback) { callback.call(_this); });
      current_test_id++;
      // Fresh sync epoch: sync-board async scheduled by a PRIOR test captured the old
      // epoch, so the stubTraversalSyncBoards guard no-ops it when it fires during THIS
      // test — stopping late traversal/store_url work from bleeding onto the shared
      // persistence singleton (issue #589).
      if (typeof LingoLinq !== 'undefined') { LingoLinq.sync_epoch = (LingoLinq.sync_epoch || 0) + 1; }
      instance.call(this_arg);
      var pollAttempts = 0;
      var pollUntilIdle = function() {
        if ((waiting[current_test_id] || 0) === 0) {
          var settleMs = (typeof LingoLinq !== 'undefined' && LingoLinq.sync_testing) ? 500 : 0;
          if (settleMs > 0) { setTimeout(onIdle, settleMs); } else { onIdle(); }
        } else if (pollAttempts < maxPoll) {
          pollAttempts++;
          setTimeout(pollUntilIdle, pollAttempts < 10 ? 10 : 100);
        } else {
          onHung();
        }
      };
      pollUntilIdle();
    };
    var MAX_ATTEMPTS = 3;
    if (current_assert.timeout) { current_assert.timeout(15000 * MAX_ATTEMPTS + 5000); }
    // Buffer QUnit results so only the FINAL attempt's are reported.
    var realPush = current_assert.pushResult.bind(current_assert);
    var buffered = [];
    current_assert.pushResult = function(r) { buffered.push(r); };
    var cleanupAttempt = function() {
      emberRun(function() {
        cancelHarnessAsyncWork();
        current_afters = [];
        post.forEach(function(callback) { callback.call(_this); });
        restoreStubs();
      });
    };
    var attempt = function(n) {
      buffered = [];
      emberRun(function() {
        runOnce(function onIdle() {
          cleanupAttempt();
          var failed = buffered.some(function(r) { return r && r.result === false; });
          if (failed && n < MAX_ATTEMPTS) { console.warn('[RETRY] ' + name + ' :: attempt ' + n + ' failed: ' + buffered.filter(function(r) { return r && r.result === false; }).map(function(r) { return r.message; }).join(' | ')); attempt(n + 1); return; }
          finalize(false);
        }, function onHung() {
          cleanupAttempt();
          if (n < MAX_ATTEMPTS) { console.warn('[RETRY] ' + name + ' :: attempt ' + n + ' hung'); attempt(n + 1); return; }
          finalize(true);
        }, 110); // ~10s/attempt, under the raised QUnit timeout
      });
    };
    var finalize = function(hung) {
      current_assert.pushResult = realPush;
      if (hung && !buffered.some(function(r) { return r && r.result === false; })) {
        realPush({ result: false, message: 'sync test still hung after ' + MAX_ATTEMPTS + ' attempts (issue #589)' });
      }
      buffered.forEach(function(r) { realPush(r); });
      assert = null;
      testDone();
      if (typeof LingoLinq !== 'undefined') { LingoLinq.sync_testing = false; }
    };
    attempt(1);
  });
}

var container_lookup = null;
var describe = function(name, lookup, callback) {
  if(!callback) {
    callback = lookup;
  } else {
    if(names.length === 0) { container_lookup = lookup; }
  }
  var add_test = function() {
    names.push(name);
    all_tests.push([]);
    all_befores.push([]);
    all_afters.unshift([]);
    try {
      callback();
      all_tests[all_tests.length - 1].forEach(function(args) {
        if(args[2]) {
          QUnit.test.skip(names.join(" ") + " - " + args[0], function() {});
        } else if(args[3] === 'async') {
          async_test_wrap(names.join(" ") + " - " + args[0], args[1], all_befores, all_afters, container_lookup);
        } else if(args[1]) {
          test_wrap(names.join(" ") + " - " + args[0], args[1], all_befores, all_afters, container_lookup);
        } else {
          console.debug('PENDING TEST: ' + names.join(" ") + " - " + args[0]);
        }
      });
    } finally {
      names.pop();
      all_befores.pop();
      all_afters.shift();
      all_tests.pop();
      if (names.length === 0) {
        container_lookup = null;
      }
    }
  }
  if(names.length === 0) {
    QUnit.module(name, function(hooks) {
      setupTest(hooks);
      add_test();
    });
  } else {
    add_test();
  }
};
var context = describe;
var it = function(rule, testing) {
  all_tests[all_tests.length - 1].push([rule, testing]);
};
var itAsync = function(rule, testing) {
  all_tests[all_tests.length - 1].push([rule, testing, false, 'async']);
};
var xit = function(rule, testing) {
  all_tests[all_tests.length - 1].push([rule, testing, true]);
};
var xdescribe = function(name, lookup, callback) {
  if(!callback) {
    callback = lookup;
    lookup = undefined;
  }
  var priorIt = it;
  it = xit;
  try {
    describe(name, lookup, callback);
  } finally {
    it = priorIt;
  }
};
var expect = function(data) {
  var expectation = {}; if (!assert) { recordLateAssertion(data); } // see recordLateAssertion
  expectation.toEqual = function(arg) {
    if((data === undefined && arg === null) || (data === null && arg === undefined)) {
      assert.ok(true, 'both empty values');
    } else if((typeof data === 'object') || (typeof arg === 'object')) {
      assert.deepEqual(data, arg);
    } else {
      if(!assert) { console.error('not run as part of a test'); }
      assert.equal(data, arg);
    }
  };
  // Strict identity. toEqual above deliberately falls through to assert.equal
  // for non-objects, so false / 0 / '' compare equal to each other — fine for
  // most assertions, wrong when the distinction between those values IS the
  // thing under test (see tests/utils/ai_feature_gate-test.js).
  expectation.toBe = function(arg) {
    assert.strictEqual(data, arg);
  };
  expectation.toBeTruthy = function() {
    assert.ok(!!data, JSON.stringify(data) + ' should be truthy');
  };
  expectation.toBeFalsy = function() {
    var falsy = !!data;
    assert.ok(falsy === false, data + ' should be falsey');
  };
  expectation.toBeDefined = function() {
    assert.ok(typeof data !== 'undefined', 'expected value to be defined');
  };
  expectation.toBeUndefined = function() {
    assert.ok(typeof data === 'undefined', JSON.stringify(data) + ' should be undefined');
  };
  expectation.toContain = function(arg) {
    if (typeof data === 'string') {
      assert.ok(data.indexOf(arg) !== -1, data + ' should contain ' + arg);
    } else if (data && typeof data.indexOf === 'function') {
      assert.ok(data.indexOf(arg) !== -1, JSON.stringify(data) + ' should contain ' + arg);
    } else {
      assert.ok(false, 'toContain requires a string or array');
    }
  };

  expectation.toNotEqual = function(arg) {
    if((data === undefined && arg === null) || (data === null && arg === undefined)) {
      assert.ok(false, data + " should not equal " + arg);
    } else if((typeof data === 'object') || (typeof arg === 'object')) {
      assert.notDeepEqual(data, arg);
    } else {
      assert.notEqual(data, arg);
    }
  };
  expectation.toBeGreaterThan = function(arg) {
    assert.ok(data > arg, data + ' should be greater than ' + arg);
  };
  expectation.toBeLessThan = function(arg) {
    assert.ok(data < arg, data + ' should be less than ' + arg);
  };
  expectation.toMatch = function(regex) {
    if(typeof regex == 'string') {
      regex = new RegExp(regex);
    }
    assert.ok(data && data.match(regex), data + ' should match ' + regex.toString());
  };
  expectation.toThrow = function(message) {
    var error = null;
    try {
      data();
    } catch(e) {
      error = e;
    }
    if(error) {
      if(message) {
        assert.equal(message, error.message || error);
      } else {
        assert.ok(true);
      }
    } else {
      assert.ok(false, 'expected error, none was raised');
    }
  };
  expectation.not = {
    toEqual: expectation.toNotEqual,
    toThrow: function() {
      var error = null;
      try {
        data();
      } catch(e) {
        error = e;
      }
      if(error) {
        assert.ok(false, 'expected no error, got ' + error.message);
      } else {
        assert.ok(true);
      }
    }
  };

  return expectation;
};

var lastWaitsFor = null, lastWaitsForTimeout = null;
var waitsFor = function(callback) { // waitsFor(condition[, message][, timeoutMs])
  lastWaitsFor = callback; var last = arguments[arguments.length - 1]; lastWaitsForTimeout = (arguments.length > 1 && typeof last === 'number') ? last : null;
};

var runs = function(callback) {
  callback = callback || function() { assert.ok(true); };
  var id = current_test_id;
  var wait = lastWaitsFor, deadline = lastWaitsForTimeout ? Math.min(Date.now() + lastWaitsForTimeout, test_started_at + ((QUnit.config && QUnit.config.testTimeout) || 15000) - 3000) : 0; // a passed timeout keeps the wait polling until this time, ended 3s before QUnit's test timeout so the harness fails it first
  var attempts = 0; if(deadline) { wait_deadlines[id] = Math.max(wait_deadlines[id] || 0, deadline); }
  waiting[current_test_id] = waiting[current_test_id] || 0;
  waiting[current_test_id]++;
  var done = function() {
    if(id == current_test_id) {
      waiting[current_test_id]--;
    }
  };
  var try_again = function() {
    if(id != current_test_id) {
      // This runs() belongs to an abandoned test/attempt (current_test_id advanced,
      // e.g. a persistence-sync retry). Stop without running its callback so it can't
      // execute assertions/cleanup into a later attempt (issue #589 retry safety).
      return;
    }
    if(wait()) {
      emberRun(callback);
      done();
    } else if(id == current_test_id) {
      attempts++;
      var maxAttempts = (typeof LingoLinq !== 'undefined' && LingoLinq.sync_testing) ? 200 : 55;
      if(attempts >= maxAttempts && !(deadline && attempts < WAIT_POLL_LIMIT && Date.now() < deadline)) { // a passed timeout only extends the wait
        assert.ok(false, 'condition failed for more than ' + (maxAttempts * 100) + 'ms');
        done();
      } else {
        var delay = 1;
        if(attempts  < 10) { delay = 10; }
        else if(attempts > 3) { delay = 100; }
        setTimeout(try_again, delay);
      }
    }
  };
  try_again();
};

var runsWhenIdle = function(callback) {
  callback = callback || function() { assert.ok(true); };
  var id = current_test_id;
  var attempts = 0;
  var try_again = function() {
    if(id != current_test_id) {
      return; // abandoned attempt (retry) — don't fire the idle callback
    }
    if((waiting[id] || 0) === 0) {
      emberRun(callback);
    } else if(id == current_test_id) {
      attempts++;
      var maxAttempts = (typeof LingoLinq !== 'undefined' && LingoLinq.sync_testing) ? 200 : 55;
      if(attempts >= maxAttempts) {
        assert.ok(false, 'condition failed for more than ' + (maxAttempts * 100) + 'ms');
      } else {
        var delay = 1;
        if(attempts  < 10) { delay = 10; }
        else if(attempts > 3) { delay = 100; }
        setTimeout(try_again, delay);
      }
    }
  };
  try_again();
};

var beforeEach = function(callback) {
  all_befores[all_befores.length - 1].push(callback);
};
var afterEach = function(callback) {
  // Mirrors unshift in add_test: the current describe level is all_afters[0], not the last
  // entry (which is the root ember_helper bucket). Using length - 1 leaked every nested
  // afterEach into the root list so all tests ran every module's cleanup hooks.
  all_afters[0].push(callback);
};

function liveAppStateTarget() {
  if (typeof window !== 'undefined' && window.LingoLinq && window.LingoLinq.appState) {
    return window.LingoLinq.appState;
  }
  return null;
}

function shouldMirrorServiceStub(object, method) {
  if (!object || !LingoLinq || !LingoLinq.testOwner || object.jquery) {
    return null;
  }
  for (var i = 0; i < SERVICE_MIRROR_RULES.length; i++) {
    var rule = SERVICE_MIRROR_RULES[i];
    if (!rule.detect(object)) {
      continue;
    }
    if (rule.methods && !rule.methods[method]) {
      continue;
    }
    try {
      var svc = LingoLinq.testOwner.lookup('service:' + rule.serviceName);
      if (svc && object !== svc) {
        return svc;
      }
    } catch (e) { /* owner torn down */ }
  }
  return null;
}

function mirrorServiceStub(object, method, replacement, stashList) {
  var svc = shouldMirrorServiceStub(object, method);
  if (!svc) {
    return;
  }
  applyStub(svc, method, replacement, stashList);
}

function resolveStubTargets(object) {
  var targets = [];
  var seen = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  var seenFallback = {};
  if (!object || object.isDestroyed) {
    return targets;
  }
  function add(target) {
    if (!target || target.isDestroyed) { return; }
    if (seen) {
      if (seen.has(target)) { return; }
      seen.set(target, true);
    } else if (seenFallback[target]) {
      return;
    } else {
      seenFallback[target] = true;
    }
    targets.push(target);
  }
  add(object);

  var liveAppState = liveAppStateTarget();
  if (liveAppState && liveAppState !== object && object === appStateUtil) {
    add(liveAppState);
  }

  return targets;
}

function shouldUseEmberSet(object, method, replacement) {
  if (!object || typeof object.set !== 'function' || typeof object.get !== 'function') {
    return false;
  }
  var current = object[method];
  if (typeof replacement === 'function' && typeof current === 'function') {
    return false;
  }
  return true;
}

function applyStub(object, method, replacement, stashList) {
  var stash;
  if (shouldUseEmberSet(object, method, replacement)) {
    stash = emberGet(object, method);
    emberSet(object, method, replacement);
  } else {
    stash = object[method];
    try {
      object[method] = replacement;
    } catch (e) {
      emberSet(object, method, replacement);
    }
  }
  stashList.push([object, method, stash]);
}

var stub = function(object, method, replacement) {
  if (!object || object.isDestroyed) { return; }
  stub.stubs = stub.stubs || [];
  var seen = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  var seenFallback = {};
  resolveStubTargets(object).forEach(function(target) {
    if (seen) {
      if (seen.has(target)) { return; }
      seen.set(target, true);
    } else if (seenFallback[target]) {
      return;
    } else {
      seenFallback[target] = true;
    }
    applyStub(target, method, replacement, stub.stubs);
  });
  mirrorServiceStub(object, method, replacement, stub.stubs);
};
stub.stubs = [];

function restoreStubs() {
  stub.stubs.slice().reverse().forEach(function(list) {
    var obj = list[0];
    var method = list[1];
    var stash = list[2];
    if (!obj || obj.isDestroyed) { return; }
    try {
      if (shouldUseEmberSet(obj, method, stash)) {
        emberSet(obj, method, stash);
      } else {
        obj[method] = stash;
      }
    } catch (e) {
      try {
        emberSet(obj, method, stash);
      } catch (e2) { /* owner torn down */ }
    }
  });
  stub.stubs = [];
}


// An it() callback may return a promise (`return c.confirm().then(function() { expect(...) })`).
// Count it as pending work, like a runs() block, so the test ends only after it settles and its
// assertions land inside the test. Ignoring it let those assertions run after cleanup had nulled
// `assert`, which only a fixed post-test settle used to hide (task log 2026-10-05_ci-test-stalls).
// A rejection fails the test instead of vanishing.
function trackReturnedPromise(result) {
  if (!result || typeof result.then !== 'function') { return; }
  var id = current_test_id;
  waiting[id] = (waiting[id] || 0) + 1;
  var settle = function() {
    if (id == current_test_id) { waiting[id]--; }
  };
  result.then(settle, function(error) {
    if (id == current_test_id && assert) {
      assert.ok(false, 'the promise returned by the test rejected: ' + ((error && error.message) || error));
    }
    settle();
  });
}

// expect() called when no test is running (`assert` is null) means an assertion ran after its
// test had ended. It then throws a TypeError, and if app code or a promise chain catches that,
// the assertion would vanish without failing anything. So it is recorded here first, and the
// next test to start fails, naming where the late call came from. A late call after the very
// last test can only be logged.
var late_assertions = [];
function recordLateAssertion(data) {
  // Skip this function and expect() itself; in the built bundle every test frame is in tests.js.
  var frame = (new Error().stack || '').split('\n').slice(3).filter(function(line) { return /tests\.js|\/tests\//.test(line); })[0] || '';
  var value;
  try { value = JSON.stringify(data); } catch (e) { value = String(data); }
  var entry = 'expect(' + String(value).slice(0, 80) + ') at ' + (frame.trim().replace(/^at /, '') || 'an unknown test file');
  late_assertions.push(entry);
  console.error('[TEST] late assertion, will fail the next test: ' + entry);
}
function reportLateAssertions(current) {
  if (!late_assertions.length || !current) { return; }
  var entries = late_assertions.splice(0, late_assertions.length);
  current.ok(false, 'expect() ran after its test had ended (a late assertion from an earlier test, so its result never counted): ' + entries.join(' | '));
}
// Report into EVERY test, not only the Jasmine-style ones: a late call followed by a plain QUnit
// test (or by no further Jasmine-style test in a shard) would otherwise only be logged.
QUnit.hooks.beforeEach(function(current) { reportLateAssertions(current); });
// Test-only access, for tests/utils/jasmine_waitsfor-test.js.
var lateAssertionTesting = {
  pending: function() { return late_assertions.slice(); },
  withoutAssert: function(callback) { var saved = assert; assert = null; try { callback(); } finally { assert = saved; } },
  report: reportLateAssertions
};

export {context, describe, xdescribe, it, itAsync, xit, expect, beforeEach, afterEach, waitsFor, runs, stub, restoreStubs, currentAssert, lateAssertionTesting};
