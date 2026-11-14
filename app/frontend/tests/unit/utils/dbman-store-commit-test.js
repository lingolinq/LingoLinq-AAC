import { module, test } from 'qunit';
import dbman from 'frontend/utils/dbman';
import capabilities from 'frontend/utils/capabilities';

/* A WRITE IS SAVED WHEN ITS TRANSACTION COMMITS (2026-11-07, PR #1268).
 *
 * In IndexedDB a put request can succeed and its transaction still abort when it commits: a device out of
 * storage reports QuotaExceededError there, on the transaction. dbman.store_internal used to report the
 * write as saved on the request's success, so a full device's sync reported success with nothing saved.
 * These drive the real store_internal with a stand-in database (the other dbman tests replace
 * store_internal itself, tests/helpers/ember_helper.js).
 */
function fakeDatabase(outcome) {
  var tx = { error: null };
  var request = {};
  tx.objectStore = function() {
    return {
      put: function() {
        if(outcome === 'throws') {
          var err = new Error('full');
          err.name = 'QuotaExceededError';
          throw err;
        }
        setTimeout(function() {
          if(outcome === 'request_error') {
            request.error = { name: 'ConstraintError' };
            if(request.onerror) { request.onerror({}); }
            if(tx.onabort) { tx.onabort({}); }
            return;
          }
          if(request.onsuccess) { request.onsuccess({}); }
          setTimeout(function() {
            if(outcome === 'ok') {
              if(tx.oncomplete) { tx.oncomplete({}); }
            } else if(outcome === 'quota_at_commit') {
              tx.error = { name: 'QuotaExceededError' };
              if(tx.onabort) { tx.onabort({}); }
            }
          }, 5);
        }, 0);
        return request;
      }
    };
  };
  return { transaction: function() { return tx; } };
}

function storeWith(outcome) {
  // store_internal reads the database once, when it opens the transaction, so the stand-in is in place
  // only for that synchronous call: nothing else in the app can reach it.
  var prior = { db: capabilities.db, type: dbman.db_type };
  var calls = [];
  capabilities.db = fakeDatabase(outcome);
  dbman.db_type = 'indexeddb';
  try {
    dbman.store_internal('board', { id: '1_1', raw: {} }, function() { calls.push('saved'); }, function(err) { calls.push(err); });
  } finally {
    capabilities.db = prior.db;
    dbman.db_type = prior.type;
  }
  return new Promise(function(resolve) { setTimeout(function() { resolve(calls); }, 60); });
}

module('Unit | Utility | dbman store_internal commit', function() {
  test('a write is saved once its transaction commits', async function(assert) {
    assert.deepEqual(await storeWith('ok'), ['saved']);
  });

  test('a write whose transaction aborts at commit for lack of storage is not saved', async function(assert) {
    var calls = await storeWith('quota_at_commit');
    assert.strictEqual(calls.length, 1, 'one answer');
    assert.notStrictEqual(calls[0], 'saved');
    assert.true(calls[0].quota, 'reported as out of storage');
  });

  test('a failed write request answers once, as a failure', async function(assert) {
    var calls = await storeWith('request_error');
    assert.strictEqual(calls.length, 1, 'one answer');
    assert.notStrictEqual(calls[0], 'saved');
    assert.false(calls[0].quota);
  });

  test('a write that throws for lack of storage answers as a failure instead of never', async function(assert) {
    var calls = await storeWith('throws');
    assert.strictEqual(calls.length, 1, 'one answer');
    assert.true(calls[0].quota, 'reported as out of storage');
  });
});

/* The installed apps write through SQLite (pass 2 of the final review of #1268). A full disk there never set
 * `quota`, so the sync said "try again" instead of "out of storage". The iOS plugin reports SQLite's rc 13 as
 * "... database or disk is full" (no SQLITE_FULL in the text). */
module('Unit | Utility | dbman store_internal on SQLite', function() {
  function sqliteStore(write_error) {
    var prior = { db: dbman.db, type: dbman.db_type };
    var calls = [];
    dbman.db_type = 'sqlite_plugin';
    dbman.db = {
      executeSql: function(sql, args, success, error) {
        if(/^SELECT/.test(sql)) { setTimeout(function() { success({ rows: { length: 0 } }); }, 0); return; }
        setTimeout(function() { error(write_error); }, 0);
      }
    };
    // The INSERT is issued from the SELECT's callback, so the stand-in stays until the write has answered.
    return new Promise(function(resolve) {
      var finish = function() { dbman.db = prior.db; dbman.db_type = prior.type; resolve(calls); };
      try {
        dbman.store_internal('board', { id: '1_7', key: 'example/board', raw: {} }, function() { calls.push('saved'); finish(); }, function(err) { calls.push(err); finish(); });
      } catch(e) { calls.push(e); finish(); }
    });
  }

  test('a write refused because the disk is full answers as out of storage', async function(assert) {
    var calls = await sqliteStore({ message: 'Run: in run rc: 13 message: database or disk is full' });
    assert.strictEqual(calls.length, 1);
    assert.true(calls[0].quota);
  });

  test('another write error is not reported as out of storage', async function(assert) {
    var calls = await sqliteStore({ message: 'Run: in run rc: 19 message: UNIQUE constraint failed' });
    assert.strictEqual(calls.length, 1);
    assert.false(calls[0].quota);
  });
});
