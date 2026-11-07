import { module, test } from 'qunit';
import RSVP from 'rsvp';
import capabilities from 'frontend/utils/capabilities';
import stashes from 'frontend/utils/_stashes';
import { stub, restoreStubs } from 'frontend/tests/helpers/jasmine';

/* A failed database setup must not leave local reads waiting forever (#1205). dbman.not_ready queues
 * every storage call while capabilities.db is undefined, and only a successful setup drained that
 * queue, so on a failure boards simply never loaded and nothing said why. */
module('Unit | Utility | capabilities database setup failure', function(hooks) {
  hooks.beforeEach(function() {
    this.real = {db: capabilities.db, wait: capabilities.db_setup_wait, queue: capabilities.queued_db_actions};
    capabilities.queued_db_actions = [];
    stub(stashes, 'db_settings', function() { return RSVP.resolve({db_id: 'me', db_key: 'db'}); });
  });
  hooks.afterEach(function() {
    restoreStubs();
    capabilities.db = this.real.db;
    capabilities.db_setup_wait = this.real.wait;
    capabilities.queued_db_actions = this.real.queue;
  });

  function queued(action) {
    var outcome = {};
    var promise = {
      resolve: function(res) { outcome.resolved = res; },
      reject: function(err) { outcome.rejected = err; }
    };
    capabilities.queued_db_actions.push([action || function() { return RSVP.resolve('ran'); }, {}, promise]);
    return outcome;
  }

  test('a setup that fails rejects what was waiting, and later calls fail at once', function(assert) {
    assert.expect(4);
    var setup = capabilities.mini_promise();
    stub(capabilities.dbman, 'setup_database', function() { return setup; });
    var waiting = queued();
    var done = assert.async();
    var result = capabilities.setup_database();
    result.then(null, function(err) {
      assert.deepEqual(err, {error: 'duplicate column name: key_id'}, 'the caller hears why');
      assert.false(capabilities.db, 'dbman.not_ready now rejects at once');
      assert.ok(waiting.rejected, 'the queued read was told');
      assert.deepEqual(capabilities.queued_db_actions, []);
      done();
    });
    setTimeout(function() { setup.reject({error: 'duplicate column name: key_id'}); }, 0);
  });

  test('a setup that never answers gives up, rather than leaving reads waiting', function(assert) {
    assert.expect(3);
    stub(capabilities.dbman, 'setup_database', function() { return capabilities.mini_promise(); });
    capabilities.db_setup_wait = 5;
    var waiting = queued();
    var done = assert.async();
    capabilities.setup_database().then(null, function(err) {
      assert.strictEqual(err.error, 'db setup timed out');
      assert.false(capabilities.db);
      assert.ok(waiting.rejected);
      done();
    });
  });
});
