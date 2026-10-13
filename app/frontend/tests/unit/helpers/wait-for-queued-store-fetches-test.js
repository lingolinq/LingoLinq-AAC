import { module, test } from 'qunit';
import { setupTest, waitForQueuedStoreFetches, queuedFetchReport } from 'frontend/tests/helpers';
import { markQueuedByAnotherTest } from 'frontend/tests/helpers/fetch-tracking';

/*
 * A test that triggers an Ember Data fetch and ends at once could have its store destroyed before
 * the fetch is sent (Ember Data sends queued fetches a tick later). setupTest therefore waits for
 * queued fetches before teardown; this checks that wait actually waits.
 */
module('Unit | Helper | waitForQueuedStoreFetches', function(hooks) {
  // Registered before setupTest, so it runs AFTER setupTest's teardown check (QUnit runs afterEach hooks
  // in reverse order of registration): a test that sets this.__expectReported checks it was reported.
  hooks.afterEach(function(assert) {
    if (this.__expectReported) {
      const name = this.__expectReported;
      assert.true(queuedFetchReport.some((entry) => entry.endsWith(`: ${name}`)), `the queued fetch was reported for "${name}"`);
    }
  });
  setupTest(hooks);

  test('resolves only once no Ember Data fetch is still queued', async function(assert) {
    assert.expect(5);
    const store = this.owner.lookup('service:store');
    const adapter = store.adapterFor('application');
    const realFindRecord = adapter.findRecord;
    adapter.findRecord = function() { return new Promise(function() {}); }; // the request itself never answers
    try {
      store.findRecord('board', 'queued-fetch-probe').catch(function() {});
      const fetchManager = store._fetchManager;
      assert.true(fetchManager._pendingFetch.size > 0, 'the fetch is queued, not yet sent');
      // A 5 s limit, not the default 500 ms, so this also holds under the opt-in fetch probe (?probeDelay=1500).
      assert.true(await waitForQueuedStoreFetches(this.owner, 5000), 'it reports that a fetch was still queued');
      assert.strictEqual(fetchManager._pendingFetch.size, 0, 'after the wait, nothing is still queued');
      assert.false(store.isDestroyed, 'and the store is still alive, so the send happened before teardown');
      assert.false(await waitForQueuedStoreFetches(this.owner), 'with nothing queued it reports nothing');
    } finally {
      adapter.findRecord = realFindRecord;
    }
  });

  // setupTest fails a test that ends with a fetch still queued (tests/helpers/index.js). This one does so on
  // purpose and turns that one expected failure into a pass: without the check it would be one assertion
  // short of its assert.expect(2). Synchronous on purpose: QUnit reaches the hooks before the flush.
  test('a test that ends with a fetch still queued is failed by setupTest', function(assert) {
    assert.expect(2);
    this.__strictQueuedFetch = true; // the failing mode, whatever this run's timingStrict is
    const push = assert.pushResult;
    assert.pushResult = function(result) {
      if (result && /Ember Data fetch was still queued when this test ended/.test(result.message)) {
        // Only a FAILING report counts: a check softened to log (or to push a pass) must fail this test.
        return push.call(assert, result.result === false
          ? { result: true, actual: result.message, expected: result.message, message: 'setupTest failed the test that left its fetch queued' }
          : { result: false, actual: 'reported as a pass', expected: 'a failure', message: 'setupTest reported the queued fetch but did not fail the test' });
      }
      return push.call(assert, result);
    };
    const store = this.owner.lookup('service:store');
    const adapter = store.adapterFor('application');
    // Not put back: this owner's adapter is torn down with it, and the queued flush (run during the
    // teardown wait, possibly delayed by the fetch probe) must still find this stand-in.
    adapter.findRecord = function() { return Promise.reject(new Error('not sent in this test')); };
    store.findRecord('board', 'queued-fetch-left-on-purpose').catch(function() {});
    assert.ok(true, 'a fetch is left queued');
  });
  // A fetch queued by an EARLIER test's late work (LingoLinq.store points at the current store) is
  // reported, not charged to the one running; see tests/helpers/fetch-tracking.js. This one leaves one
  // queued and marks it as another test's: setupTest must not fail it.
  test('a fetch queued by another test is reported, not charged to this one', function(assert) {
    assert.expect(2);
    this.__strictQueuedFetch = true; // the mode that WOULD fail it, so only the attribution can save it
    this.__expectReported = 'a fetch queued by another test is reported, not charged to this one';
    const push = assert.pushResult;
    assert.pushResult = function(result) {
      if (result && /Ember Data fetch was still queued when this test ended/.test(result.message)) {
        return push.call(assert, { result: false, actual: 'charged to this test', expected: 'reported as late work', message: 'setupTest failed a test for a fetch another test queued' });
      }
      return push.call(assert, result);
    };
    const store = this.owner.lookup('service:store');
    store.adapterFor('application').findRecord = function() { return Promise.reject(new Error('not sent in this test')); };
    store.findRecord('board', 'queued-by-another-test').catch(function() {});
    markQueuedByAnotherTest(store._fetchManager);
    assert.ok(true, 'a fetch is left queued, attributed to another test');
  });
  // Outside a timing-strict run (the required build-and-test) a queued fetch is reported, not failed:
  // it may be an earlier test's late callback, which the harness cannot tell apart.
  test('outside a timing-strict run a queued fetch is reported, not failed', function(assert) {
    assert.expect(2);
    this.__strictQueuedFetch = false;
    this.__expectReported = 'outside a timing-strict run a queued fetch is reported, not failed';
    const push = assert.pushResult;
    assert.pushResult = function(result) {
      if (result && /Ember Data fetch was still queued when this test ended/.test(result.message)) {
        return push.call(assert, { result: false, actual: 'failed', expected: 'reported only', message: 'setupTest failed a queued fetch outside a timing-strict run' });
      }
      return push.call(assert, result);
    };
    const store = this.owner.lookup('service:store');
    store.adapterFor('application').findRecord = function() { return Promise.reject(new Error('not sent in this test')); };
    store.findRecord('board', 'queued-in-report-mode').catch(function() {});
    assert.ok(true, 'a fetch is left queued in report mode');
  });
});
