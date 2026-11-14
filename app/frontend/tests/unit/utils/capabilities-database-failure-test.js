import { module, test } from 'qunit';
import RSVP from 'rsvp';
import capabilities from 'frontend/utils/capabilities';
import stashes from 'frontend/utils/_stashes';
import { stub, restoreStubs } from 'frontend/tests/helpers/jasmine';
import { standInGlobals } from 'frontend/tests/helpers/stand-in-globals';
import EmberObject from '@ember/object';

/* A failed database setup must not leave local reads waiting forever (#1205). dbman.not_ready queues
 * every storage call while capabilities.db is undefined, and only a successful setup drained that
 * queue, so on a failure boards simply never loaded and nothing said why. */
module('Unit | Utility | capabilities database setup failure', function(hooks) {
  // This module boots no app, and utils/_stashes forwards to window.stashes: without its own stand-in the stub
  // below lands on whatever service an earlier test left there, torn down (tests/helpers/leak-check.js).
  standInGlobals(hooks, { stashes: () => EmberObject.create({}) });
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

  test('queued calls can still run when the database itself is open', function(assert) {
    assert.expect(2);
    var waiting = queued();
    capabilities.run_queued_db_actions();
    var done = assert.async();
    setTimeout(function() {
      assert.strictEqual(waiting.resolved, 'ran');
      assert.deepEqual(capabilities.queued_db_actions, []);
      done();
    }, 0);
  });

  test('a setup that answers after the watchdog gave up changes nothing', function(assert) {
    // Final review of #1268: the late success used to connect the database, run the queued reads and resolve a
    // promise already rejected, leaving capabilities.db false beside a live database.
    assert.expect(6);
    var setup = capabilities.mini_promise();
    stub(capabilities.dbman, 'setup_database', function() { return setup; });
    var connects = 0;
    stub(stashes, 'db_connect', function() { connects++; return RSVP.resolve(); });
    capabilities.db_setup_wait = 5;
    var waiting = queued();
    var done = assert.async();
    var outcome = {};
    capabilities.setup_database().then(function() { outcome.resolved = true; }, function(err) { outcome.rejected = err; });
    setTimeout(function() { setup.resolve({}); }, 30);
    setTimeout(function() {
      assert.ok(outcome.rejected, 'rejected');
      assert.strictEqual((outcome.rejected || {}).error, 'db setup timed out');
      assert.notOk(outcome.resolved, 'not resolved after the rejection');
      assert.false(capabilities.db);
      assert.strictEqual(connects, 0, 'the late database is not connected');
      assert.notOk(waiting.resolved, 'the queued read stays rejected');
      done();
    }, 80);
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
