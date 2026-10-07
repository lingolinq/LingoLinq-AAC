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
    assert.expect(3);
    const store = this.owner.lookup('service:store');
    const adapter = store.adapterFor('application');
    const realFindRecord = adapter.findRecord;
    adapter.findRecord = function() { return new Promise(function() {}); }; // the request itself never answers
    try {
      store.findRecord('board', 'queued-fetch-probe').catch(function() {});
      const fetchManager = store._fetchManager;
      assert.true(fetchManager._pendingFetch.size > 0, 'the fetch is queued, not yet sent');
      await waitForQueuedStoreFetches(this.owner);
      assert.strictEqual(fetchManager._pendingFetch.size, 0, 'after the wait, nothing is still queued');
      assert.false(store.isDestroyed, 'and the store is still alive, so the send happened before teardown');
    } finally {
      adapter.findRecord = realFindRecord;
    }
  });
});
