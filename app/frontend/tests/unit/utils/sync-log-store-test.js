import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import { SYNC_LOG_KEEP, entry_copy, log_owner, record_sync_log, merge_logs, restore_sync_log, last_result, restored_lead_kind, partial_result } from 'frontend/utils/sync_log_store';

/* THE SYNC LOG SURVIVES A RESTART (docs/task-management/2026-11-15_persist-sync-log.md, Traci 2026-11-15): the newest 5
 * sync results are kept in the signed-in person's own device database (settings/syncLog), never for someone else's
 * database or a signed-out device, and a failed save is not counted against a sync. */
module('Unit | Utility | sync log store', function() {
  function fake_storage(opts) {
    opts = opts || {};
    var calls = { stored: [], finds: 0 };
    return {
      calls: calls,
      store: function(store, record, key) { calls.stored.push({ store: store, record: JSON.parse(JSON.stringify(record)), key: key }); return opts.store_fails ? RSVP.reject({ error: 'quota', quota: true }) : RSVP.resolve(record); },
      find: function(store, key) { calls.finds++; return opts.stored ? RSVP.resolve({ raw: opts.stored, storageId: key }) : RSVP.reject({ error: 'not found' }); }
    };
  }
  function service(owner_name, db_id) {
    return EmberObject.create({
      sync_log: [],
      stashes: { get_object: function(key) { return key === 'auth_settings' && owner_name !== undefined ? { user_name: owner_name } : null; } },
      db_name_for_test: 'lingolinqStorage::' + db_id + '===db'
    });
  }
  function deps(p, storage) { return { storage: storage, db_name: p.get('db_name_for_test') }; }
  function entry(n, extra) {
    return Object.assign({ user_id: 'me', manual: true, finished: new Date(1700000000000 + n * 1000), summary: 'sync ' + n, statuses: [{ id: '1_' + n, key: 'me/b' + n, status: 'downloaded' }], roots: { 'me/b': { root: 'me/b' } } }, extra || {});
  }

  test('only the person who owns the open database owns the log', function(assert) {
    assert.strictEqual(log_owner({ user_name: 'me' }, 'lingolinqStorage::me===db'), 'me');
    assert.strictEqual(log_owner({ user_name: 'you' }, 'lingolinqStorage::me===db'), null, 'someone else signed in on this database');
    assert.strictEqual(log_owner(null, 'lingolinqStorage::me===db'), null, 'signed out');
    assert.strictEqual(log_owner({}, 'lingolinqStorage::__===db'), null, 'the signed-out database');
    assert.strictEqual(log_owner({ user_name: '__' }, 'lingolinqStorage::__===db'), null);
    assert.strictEqual(log_owner({ user_name: 'me' }, undefined), null, 'no database yet');
  });

  test('a saved entry keeps only what the log needs', function(assert) {
    var e = entry(1, { cached: 3, sorted_statuses: [], toggled: true });
    e.statuses[0].idx = 0; e.statuses[0].downloaded = true;
    var copy = entry_copy(e);
    assert.deepEqual(Object.keys(copy).sort(), ['finished', 'manual', 'roots', 'statuses', 'summary', 'user_id']);
    assert.deepEqual(copy.statuses, [{ id: '1_1', key: 'me/b1', status: 'downloaded' }], 'what Sync Details adds to a row is left out');
    assert.deepEqual(entry_copy({ errored: true, finished: e.finished }).statuses, [], 'an entry without rows gets an empty list');
  });

  // Part 2 unit T: the content tag survives a restart, so PR #1328's list reads it from a restored entry too.
  test('a saved entry keeps the content tag on a row', function(assert) {
    var e = entry(1);
    e.statuses = [{ id: '1_1', key: 'me/core', status: 'downloaded', error: 'board me/core failed to sync completely', content: true }];
    assert.deepEqual(entry_copy(e).statuses, [{ id: '1_1', key: 'me/core', status: 'downloaded', error: 'board me/core failed to sync completely', content: true }]);
  });

  test('a finished sync is saved, newest 5, in the owner\'s record', function(assert) {
    var p = service('me', 'me');
    var storage = fake_storage();
    var log = [1, 2, 3, 4, 5, 6, 7].map(function(n) { return entry(n); });
    var kept = record_sync_log(p, log, deps(p, storage));
    assert.strictEqual(kept.length, SYNC_LOG_KEEP);
    assert.deepEqual(kept.map(function(e) { return e.summary; }), ['sync 3', 'sync 4', 'sync 5', 'sync 6', 'sync 7']);
    assert.strictEqual(storage.calls.stored.length, 1);
    var saved = storage.calls.stored[0];
    assert.deepEqual([saved.store, saved.key, saved.record.storageId], ['settings', 'syncLog', 'syncLog']);
    assert.strictEqual(saved.record.raw.owner, 'me');
    assert.strictEqual(saved.record.raw.entries.length, 5);
  });

  test('nothing is saved for someone else\'s database or a signed-out device', function(assert) {
    var storage = fake_storage();
    var other = service('you', 'me');
    assert.strictEqual(record_sync_log(other, [entry(1)], deps(other, storage)).length, 1, 'still kept in memory');
    var out = service(undefined, '__');
    record_sync_log(out, [entry(1)], deps(out, storage));
    assert.strictEqual(storage.calls.stored.length, 0);
  });

  // persistence.store() counts a failed write against the running sync (services/persistence.js:771,
  // utils/storage_failures.js note_failed_write), so the log is saved past it, straight to device storage.
  test('a save goes straight to device storage, and a failed one is swallowed', async function(assert) {
    var p = service('me', 'me');
    var through_persistence = 0;
    p.set('store', function() { through_persistence++; return RSVP.resolve(); });
    var storage = fake_storage({ store_fails: true });
    record_sync_log(p, [entry(1)], deps(p, storage));
    await new RSVP.Promise(function(r) { setTimeout(r, 10); });
    assert.strictEqual(storage.calls.stored.length, 1, 'written to device storage');
    assert.strictEqual(through_persistence, 0, 'not through persistence.store, which would count a failure');
  });

  test('restored entries go before the ones in memory, without duplicates, with dates back', function(assert) {
    var stored = [entry(1), entry(2)].map(function(e) { var c = entry_copy(e); c.finished = c.finished.toISOString(); return c; });
    var memory = [entry(2), entry(3)];
    var merged = merge_logs(stored, memory);
    assert.deepEqual(merged.map(function(e) { return e.summary; }), ['sync 1', 'sync 2', 'sync 3']);
    assert.true(merged[0].finished instanceof Date, 'finished is a Date again');
    assert.deepEqual(merge_logs([null, 'x', { finished: 'bad' }], []).length, 0, 'junk is dropped');
    var many = [1, 2, 3, 4, 5, 6].map(function(n) { return entry_copy(entry(n)); });
    assert.strictEqual(merge_logs(many, [entry(7)]).length, SYNC_LOG_KEEP);
  });

  test('restore runs once, for the owner only, and a missing record changes nothing', async function(assert) {
    var p = service('me', 'me');
    p.set('sync_log', [entry(3)]);
    var storage = fake_storage({ stored: { owner: 'me', entries: [entry_copy(entry(1))] } });
    await restore_sync_log(p, deps(p, storage));
    await restore_sync_log(p, deps(p, storage));
    assert.strictEqual(storage.calls.finds, 1, 'read once');
    assert.deepEqual(p.get('sync_log').map(function(e) { return e.summary; }), ['sync 1', 'sync 3']);

    var q = service('me', 'me');
    await restore_sync_log(q, deps(q, fake_storage({ stored: { owner: 'you', entries: [entry_copy(entry(1))] } })));
    assert.deepEqual(q.get('sync_log'), [], 'a record from another owner is not shown');

    var r = service('me', 'me');
    await restore_sync_log(r, deps(r, fake_storage()));
    assert.deepEqual(r.get('sync_log'), [], 'no record yet');

    var s = service(undefined, '__');
    var s_storage = fake_storage({ stored: { owner: 'me', entries: [entry_copy(entry(1))] } });
    await restore_sync_log(s, deps(s, s_storage));
    assert.strictEqual(s_storage.calls.finds, 0, 'a signed-out device reads nothing');
    s.set('stashes', { get_object: function(key) { return key === 'auth_settings' ? { user_name: 'me' } : null; } });
    s.set('db_name_for_test', 'lingolinqStorage::me===db');
    await restore_sync_log(s, deps(s, s_storage));
    assert.strictEqual(s_storage.calls.finds, 1, 'a skipped try does not use up the one restore');
  });

  test('the grouped view uses the latest result that has rows', function(assert) {
    var log = [entry(1), entry(2, { canceled: true, statuses: [] })];
    var r = last_result(log);
    assert.strictEqual(r.entry.summary, 'sync 1');
    assert.true(r.from_earlier, 'an earlier sync than the last one');
    var r2 = last_result([entry(1), entry(2)]);
    assert.strictEqual(r2.entry.summary, 'sync 2');
    assert.false(r2.from_earlier);
    assert.strictEqual(last_result([entry(1, { statuses: [] })]), null);
    assert.strictEqual(last_result(null), null);
  });

  // The iOS WebKit run (2026-11-15): a sync that failed or was cancelled part way has SOME rows; shown as the result
  // they read "100% ready offline, 1 of 1". Only a sync that finished counts.
  test('a failed or cancelled sync with some rows is not the result', function(assert) {
    var r = last_result([entry(1), entry(2, { errored: true }), entry(3, { canceled: true })]);
    assert.strictEqual(r.entry.summary, 'sync 1');
    assert.true(r.from_earlier);
    assert.strictEqual(last_result([entry(1, { errored: true })]), null, 'no finished sync yet');
    assert.strictEqual(last_result([entry(1, { issues: true })]).entry.summary, 'sync 1', 'a sync with problems did finish');
  });

  // docs/task-management/2026-11-16_sync-details-no-percent.md (Traci, 2026-11-16): with no finished sync, Sync Details
  // shows what the newest stopped sync saved, under "Saved before the sync stopped".
  test('the newest stopped sync with rows, for when no sync has finished', function(assert) {
    var r = partial_result([entry(1, { errored: true }), entry(2, { canceled: true })]);
    assert.strictEqual(r.entry.summary, 'sync 2');
    assert.false(r.from_earlier);
    var r2 = partial_result([entry(1, { errored: true }), entry(2, { errored: true, statuses: [] })]);
    assert.strictEqual(r2.entry.summary, 'sync 1');
    assert.true(r2.from_earlier, 'a later stop saved nothing');
    assert.strictEqual(partial_result([entry(1, { errored: true }), entry(2)]).entry.summary, 'sync 1', 'a finished sync is never the partial one');
    assert.strictEqual(partial_result([entry(1)]), null);
    assert.strictEqual(partial_result([entry(1, { errored: true, storage_failed: true })]), null, 'boards the device could not save are not shown as saved');
    assert.strictEqual(partial_result(null), null);
  });

  test('a saved entry keeps whether the device could not save its boards', function(assert) {
    assert.true(entry_copy(entry(1, { errored: true, storage_failed: true })).storage_failed);
    assert.strictEqual(entry_copy(entry(1)).storage_failed, undefined);
  });

  test('what the status line says about the last sync after a restart', function(assert) {
    assert.strictEqual(restored_lead_kind([entry(1), entry(2, { canceled: true })]), 'canceled');
    assert.strictEqual(restored_lead_kind([entry(1, { errored: true })]), 'errored');
    assert.strictEqual(restored_lead_kind([entry(1, { issues: true })]), 'issues');
    assert.strictEqual(restored_lead_kind([entry(1)]), null, 'a clean sync keeps the usual line');
    assert.strictEqual(restored_lead_kind([]), null);
  });
});
