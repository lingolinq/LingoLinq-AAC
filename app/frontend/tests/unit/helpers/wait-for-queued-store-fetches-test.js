import { module, test } from 'qunit';
import { setupTest, waitForQueuedStoreFetches } from 'frontend/tests/helpers';

/*
 * A test that triggers an Ember Data fetch and ends at once could have its store destroyed before
 * the fetch is sent (Ember Data sends queued fetches a tick later). setupTest therefore waits for
 * queued fetches before teardown; this checks that wait actually waits.
 */
module('Unit | Helper | waitForQueuedStoreFetches', function(hooks) {
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
    const push = assert.pushResult;
    assert.pushResult = function(result) {
      if (result && result.result === false && /Ember Data fetch was still queued when this test ended/.test(result.message)) {
        return push.call(assert, { result: true, actual: result.message, expected: result.message, message: 'setupTest failed the test that left its fetch queued' });
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
});
