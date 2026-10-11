import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import modal from 'frontend/utils/modal';
import { leakCheckTesting, unwrapLeakProxy } from 'frontend/tests/helpers/leak-check';

/*
 * The leak check (tests/helpers/leak-check.js) must notice each kind of leak it claims to, and must
 * not flag a stub that was put back. Each case plants one leak, runs the check's step by hand, and
 * takes ONLY the findings matching what it planted (anything else this test leaks still fails it).
 * Snapshot steps run `isolated`, so the check's own before-test snapshots are put back afterwards.
 */
module('Unit | Helper | leak check', function() {
  test('reading a destroyed service through a global is recorded', function(assert) {
    assert.expect(3);
    const saved = window.appState;
    const dead = EmberObject.create({ speak_mode: true });
    try {
      dead.destroy();
      window.appState = dead;
      leakCheckTesting.watchDestroyed();
      assert.notStrictEqual(window.appState, dead, 'the destroyed service is now watched');
      assert.strictEqual(unwrapLeakProxy(window.appState), dead, 'and the real object is still reachable');
      window.appState.get('speak_mode');
      const found = leakCheckTesting.take(/window\.appState\.get/);
      assert.true(found.some((m) => /read window\.appState\.get on a destroyed service/.test(m)), `recorded: ${found.join(' | ')}`);
    } finally {
      window.appState = saved;
      leakCheckTesting.take(/window\.appState/);
    }
  });

  test('a forwarding object that is live again by the time it is read is not recorded', function(assert) {
    assert.expect(2);
    const saved = window.appState;
    // Like utils/app_state: reports the destroyed-ness of whatever it currently forwards to.
    const forwarding = { live: false, get isDestroyed() { return !this.live; }, get() { return null; } };
    try {
      window.appState = forwarding;
      leakCheckTesting.watchDestroyed();
      assert.notStrictEqual(window.appState, forwarding, 'wrapped while it reported destroyed');
      unwrapLeakProxy(window.appState).live = true; // a new app booted; it forwards to a live service now
      window.appState.get('speak_mode');
      assert.deepEqual(leakCheckTesting.take(/window\.appState/), [], 'a read that lands on a live service is not a leak');
    } finally {
      window.appState = saved;
      leakCheckTesting.take(/window\.appState/);
    }
  });

  test('a stub left on a singleton is recorded; one put back is not', function(assert) {
    assert.expect(2);
    const original = modal.close;
    const hadOwn = Object.prototype.hasOwnProperty.call(modal, 'close');
    try {
      leakCheckTesting.isolated(() => {
        leakCheckTesting.snapshotFunctions();
        modal.close = function() {};
        leakCheckTesting.checkFunctions();
        const left = leakCheckTesting.take(/modal\.close/);
        assert.true(left.some((m) => /modal\.close was replaced and not restored/.test(m)), `recorded: ${left.join(' | ')}`);

        modal.close = original; // what restoreStubs used to do: the original, as an own property
        leakCheckTesting.checkFunctions();
        assert.deepEqual(leakCheckTesting.take(/modal\.close/), [], 'a restored original is not a leak');
      });
    } finally {
      if (hadOwn) { modal.close = original; } else { delete modal.close; } // exactly as it was
    }
  });

  test('a node left under <body> is recorded', function(assert) {
    assert.expect(1);
    const node = document.createElement('div');
    node.id = 'leak-check-planted-node';
    try {
      const found = leakCheckTesting.isolated(() => {
        leakCheckTesting.snapshotBody();
        document.body.appendChild(node);
        leakCheckTesting.checkBody();
        return leakCheckTesting.take(/leak-check-planted-node/);
      });
      assert.true(found.some((m) => /div#leak-check-planted-node> was left under <body>/.test(m)), `recorded: ${found.join(' | ')}`);
    } finally {
      node.remove();
    }
  });
  // The check must FAIL the test it finds a leak in (QUnit.hooks.afterEach, fail mode by default), not
  // just record it. This plants a stub, lets the global hook report it, and turns that one expected
  // failure into a pass; a check softened to pass, warn, or not run leaves it one assertion short or red.
  test('a deterministic finding fails the test it is found in', function(assert) {
    assert.expect(2);
    const push = assert.pushResult;
    assert.pushResult = function(result) {
      if (result && /^leak check: .*modal\.close was replaced and not restored/.test(result.message)) {
        return push.call(assert, result.result === false
          ? { result: true, actual: result.message, expected: result.message, message: 'the leak check failed the test that left a stub' }
          : { result: false, actual: 'reported as a pass', expected: 'a failure', message: 'the leak check reported the stub but did not fail the test' });
      }
      return push.call(assert, result);
    };
    const original = modal.close;
    const hadOwn = Object.prototype.hasOwnProperty.call(modal, 'close');
    try {
      leakCheckTesting.isolated(() => {
        leakCheckTesting.snapshotFunctions();
        modal.close = function() {};
        leakCheckTesting.checkFunctions(); // recorded for this test; the global hook flushes it
      });
    } finally {
      if (hadOwn) { modal.close = original; } else { delete modal.close; }
    }
    assert.ok(true, 'a stub was left and put back; its finding stays recorded for this test');
  });

  test('only reads and writes on a destroyed service count as timing-dependent findings', function(assert) {
    assert.true(leakCheckTesting.isTimingFinding('read window.appState.get on a destroyed service @ x'));
    assert.true(leakCheckTesting.isTimingFinding('write app_state.foo on a destroyed service @ x'));
    assert.false(leakCheckTesting.isTimingFinding('modal.close was replaced and not restored (a stub left on a shared singleton)'));
    assert.false(leakCheckTesting.isTimingFinding('<div#x> was left under <body>'));
  });
});
