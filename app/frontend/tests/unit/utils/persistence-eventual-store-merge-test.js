import { module, test } from 'qunit';
import { setupTest } from 'frontend/tests/helpers';
import LingoLinq from 'frontend/app';
import utilPersistence from 'frontend/utils/persistence';

/* ONE WAITING SAVE PER RECORD (2026-11-08, PR #1268, issue #1221).
 *
 * A record fetched from the server is saved to the device a moment later, through a queue
 * (store_eventually). Loading the same record twice in quick succession queued two saves of it, and both
 * were written, so a sync wrote the same user and button set twice. A save for a record already waiting
 * now takes the waiting one's place, with the newer copy.
 *
 * A record is the same when its store, id and key all match: the server's records are queued with key
 * null (every board) or 'self' (the signed-in user, which also saves which user is "self"), so matching on
 * the key alone would merge different boards. A board's images and sounds are saved as their own records
 * when it is written, so an entry carrying them is never replaced.
 */
module('Unit | Utility | persistence eventual store merge', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.persistence = this.owner.lookup('service:persistence');
    this.prior = {
      queue: this.persistence.eventual_store,
      timer: this.persistence.eventual_store_timer,
      sync_testing: LingoLinq.sync_testing
    };
    // A timer already set means store_eventually only queues: nothing runs later from this test.
    this.persistence.eventual_store = [];
    this.persistence.eventual_store_timer = 'held by test';
    LingoLinq.sync_testing = false;
  });

  hooks.afterEach(function() {
    this.persistence.eventual_store = this.prior.queue;
    this.persistence.eventual_store_timer = this.prior.timer;
    LingoLinq.sync_testing = this.prior.sync_testing;
  });

  function queued(persistence) {
    return persistence.eventual_store.map((e) => [e[0], (e[1][e[0]] || e[1]).id, e[2]]);
  }

  test('a second save of a waiting record replaces it, keeping its place, with the newer copy', function(assert) {
    const p = this.persistence;
    const first = { buttonset: { id: '1_5', v: 1 } };
    const second = { buttonset: { id: '1_5', v: 2 } };
    p.store_eventually('buttonset', first, null);
    p.store_eventually('user', { user: { id: '1_1' } }, 'self');
    p.store_eventually('buttonset', second, null);
    assert.deepEqual(queued(p), [['buttonset', '1_5', null], ['user', '1_1', 'self']]);
    assert.strictEqual(p.eventual_store[0][1], second, 'the newer copy is saved');
    assert.true(p.eventual_store[0][3], 'still marked as an eventual save');
  });

  test('different records with the same key are all kept', function(assert) {
    const p = this.persistence;
    p.store_eventually('board', { board: { id: '1_2' } }, null);
    p.store_eventually('board', { board: { id: '1_3' } }, null);
    p.store_eventually('buttonset', { buttonset: { id: '1_2' } }, null);
    assert.deepEqual(queued(p), [['board', '1_2', null], ['board', '1_3', null], ['buttonset', '1_2', null]]);
  });

  test('the same record under a different key is kept', function(assert) {
    const p = this.persistence;
    p.store_eventually('user', { user: { id: '1_1' } }, 'self');
    p.store_eventually('user', { user: { id: '1_1' } }, null);
    assert.strictEqual(p.eventual_store.length, 2);
  });

  test('a board carrying images or sounds is never replaced', function(assert) {
    const p = this.persistence;
    p.store_eventually('board', { board: { id: '1_2' }, images: [{ id: 'img_a' }] }, null);
    p.store_eventually('board', { board: { id: '1_2' }, images: [{ id: 'img_b' }] }, null);
    p.store_eventually('board', { board: { id: '1_4' }, sounds: [{ id: 'snd_a' }] }, null);
    p.store_eventually('board', { board: { id: '1_4' } }, null);
    assert.strictEqual(p.eventual_store.length, 4);
  });

  test('a record with no id and no key is never merged', function(assert) {
    const p = this.persistence;
    p.store_eventually('image', { url: 'a' }, null);
    p.store_eventually('image', { url: 'b' }, null);
    assert.strictEqual(p.eventual_store.length, 2);
  });

  // The Ember Data adapter mixes in the UTILS copy's DSExtend (adapters/application.js), whose findRecord
  // queues through the utils module's own store_eventually and queue. With window.persistence cleared the
  // module's Proxy hands back that module-local instance, the one the adapter calls.
  test('the queue the Ember Data adapter uses also replaces a waiting save of the same record', function(assert) {
    assert.expect(2);
    const savedWindow = window.persistence;
    window.persistence = null;
    const prior = { queue: utilPersistence.eventual_store, timer: utilPersistence.eventual_store_timer };
    try {
      utilPersistence.eventual_store = [];
      utilPersistence.eventual_store_timer = 'held by test';
      const second = { buttonset: { id: '1_5', v: 2 } };
      utilPersistence.store_eventually('buttonset', { buttonset: { id: '1_5', v: 1 } }, null);
      utilPersistence.store_eventually('board', { board: { id: '1_6' } }, null);
      utilPersistence.store_eventually('buttonset', second, null);
      assert.strictEqual(utilPersistence.eventual_store.length, 2);
      assert.strictEqual(utilPersistence.eventual_store[0][1], second);
    } finally {
      utilPersistence.eventual_store = prior.queue;
      utilPersistence.eventual_store_timer = prior.timer;
      window.persistence = savedWindow;
    }
  });
});
