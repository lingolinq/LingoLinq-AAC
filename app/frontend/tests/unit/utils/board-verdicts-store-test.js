import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import { setupTest } from 'frontend/tests/helpers';
import { record_sync_log, restore_sync_log } from 'frontend/utils/sync_log_store';
import { restore_board_verdicts, BOARD_VERDICTS_KEY } from 'frontend/utils/board_verdicts';
import { pick_device_boards } from 'frontend/utils/offline_board_list';

/* A liked board of another owner stays listed (or hidden) beyond the 5-entry sync log: each finished, stopped or
 * cancelled sync's verdicts are kept per person in `settings/boardVerdicts`, saved only after that record was read
 * (docs/task-management/2026-11-23-offline-liked-board-verdicts.md). */
module('Unit | Utility | board verdicts kept beyond the sync log', function(hooks) {
  setupTest(hooks);
  var K = 'therapist/feelings';
  function storage(stored) {
    var calls = { stored: [], finds: [] };
    return {
      calls: calls,
      store: function(store, record, key) { calls.stored.push({ key: key, record: JSON.parse(JSON.stringify(record)) }); return RSVP.resolve(record); },
      find: function(store, key) { calls.finds.push(key); return stored && stored[key] ? RSVP.resolve({ raw: stored[key] }) : RSVP.reject({ error: 'no record found for ' + store + ':' + key }); } // utils/dbman.js's missing-record answer
    };
  }
  function service(owner) {
    return EmberObject.create({ sync_log: [], stashes: { get_object: function(key) { return key === 'auth_settings' ? { user_name: owner } : null; } } });
  }
  var deps = function(st) { return { storage: st, db_name: 'lingolinqStorage::larry===db' }; };
  var at = 1700000000000;
  var whole = function(n, statuses, answered) { return { user_id: 'larry', issues: false, finished: new Date(at + n * 1000), statuses: statuses, answered: answered }; };
  var stop = function(n) { return { user_id: 'larry', errored: true, confirmed: true, finished: new Date(at + n * 1000), statuses: [{ id: 'larry/home', key: 'larry/home', status: 'downloaded' }] }; };
  var other = function(n) { return { user_id: 'sam', issues: false, finished: new Date(at + n * 1000), statuses: [{ id: 'sam/home', key: 'sam/home', status: 'cached' }] }; };
  var seen = function(n) { return whole(n, [{ id: K, key: K, status: 're-downloaded' }], [K]); };
  var refused = function(n) { return whole(n, [{ id: K, key: K, status: 're-downloaded', error: 'board ' + K + ' failed retrieval for syncing', refused: true }]); };
  var person = function() { return EmberObject.create({ user_name: 'larry', preferences: {}, stats: { starred_board_refs: [{ key: K }] } }); };
  var rows = [{ data: { id: '4_1', raw: { id: '4_1', key: K, name: 'Feelings', user_name: 'therapist', buttons: [], grid: { order: [] } } } }];
  var listed = function(p) { return pick_device_boards(rows, person(), p.get('sync_log'), { verdicts: p.get('board_verdicts') }).map(function(r) { return r.key; }); };
  function sync(p, entry, st) { p.set('sync_log', record_sync_log(p, [].concat(p.get('sync_log') || [], [entry]), deps(st))); }

  test('seen, then five syncs that did not finish or were someone else\'s: still listed', async function(assert) {
    var p = service('larry');
    var st = storage();
    await restore_board_verdicts(p, deps(st));
    sync(p, seen(1), st);
    [2, 3, 4].forEach(function(n) { sync(p, stop(n), st); });
    [5, 6].forEach(function(n) { sync(p, other(n), st); });
    assert.notOk(p.get('sync_log').some(function(e) { return e.finished.getTime() === at + 1000; }), 'the seeing sync has left the log');
    assert.deepEqual(listed(p), [K]);
  });

  test('refused, then five syncs that did not decide: still hidden', async function(assert) {
    var p = service('larry');
    var st = storage();
    await restore_board_verdicts(p, deps(st));
    sync(p, seen(1), st);
    sync(p, refused(2), st);
    [3, 4, 5, 6, 7].forEach(function(n) { sync(p, stop(n), st); });
    assert.deepEqual(listed(p), []);
  });

  test('each save reads, merges and writes: this session\'s and the stored verdicts combine in either order', async function(assert) {
    var first = service('larry');
    var st1 = storage();
    sync(first, seen(1), st1);
    await new RSVP.Promise(function(r) { setTimeout(r, 10); });
    var saved = st1.calls.stored.filter(function(c) { return c.key === BOARD_VERDICTS_KEY; }).pop();
    assert.ok(saved, 'written, though nothing was restored first (the read before the write merges the stored record)');
    assert.strictEqual(saved.record.raw.owner, 'larry');
    var later = service('larry'); // a new app start: a refusal syncs before the restore read lands
    var st2 = storage({ [BOARD_VERDICTS_KEY]: saved.record.raw });
    sync(later, refused(2), st2);
    await new RSVP.Promise(function(r) { setTimeout(r, 10); });
    await restore_board_verdicts(later, deps(st2));
    assert.deepEqual(listed(later), [], 'the later refusal holds over the stored earlier answer');
    var rewritten = st2.calls.stored.filter(function(c) { return c.key === BOARD_VERDICTS_KEY; }).pop().record.raw;
    var fresh = service('larry');
    await restore_board_verdicts(fresh, deps(storage({ [BOARD_VERDICTS_KEY]: rewritten })));
    assert.deepEqual(listed(fresh), [], 'and the merged record keeps it');
  });

  test('a save keeps what the stored record says about other boards', async function(assert) {
    var Q = 'aaron/colors';
    var stored = { owner: 'larry', verdicts: { larry: { top: at + 1000, t: { [K]: { v: true, n: at + 1000 } } } } };
    var st = storage({ [BOARD_VERDICTS_KEY]: stored });
    var p = service('larry'); // a sync about another board lands before the restore read
    sync(p, whole(2, [{ id: Q, key: Q, status: 're-downloaded' }], [Q]), st);
    await new RSVP.Promise(function(r) { setTimeout(r, 10); });
    var written = st.calls.stored.filter(function(c) { return c.key === BOARD_VERDICTS_KEY; }).pop().record.raw;
    var fresh = service('larry');
    await restore_board_verdicts(fresh, deps(storage({ [BOARD_VERDICTS_KEY]: written })));
    assert.deepEqual(listed(fresh), [K], 'the stored answer for the other board survived the write');
  });

  test('another owner\'s record is not read in; a failed read skips that save only; no record yet is an empty one', async function(assert) {
    var p = service('larry');
    await restore_board_verdicts(p, deps(storage({ [BOARD_VERDICTS_KEY]: { owner: 'sam', verdicts: { larry: { top: at, t: { [K]: { v: true, n: at } } } } } })));
    assert.deepEqual(listed(p), [], 'not taken from someone else\'s record');
    var q = service('larry');
    var writes = [];
    var failing = { store: function(s, r, key) { writes.push(key); return RSVP.resolve(); }, find: function() { return RSVP.reject({ error: 'db transaction error' }); } };
    sync(q, seen(1), failing);
    await new RSVP.Promise(function(r) { setTimeout(r, 10); });
    assert.strictEqual(writes.indexOf(BOARD_VERDICTS_KEY), -1, 'not written after a failed read');
    assert.deepEqual(listed(q), [K], 'still kept in memory');
  });

  test('a device clock that goes back does not let an earlier answer beat a later refusal', async function(assert) {
    var p = service('larry');
    var st = storage();
    sync(p, seen(86400), st); // answered while the clock was a day ahead
    sync(p, refused(3600), st); // the clock corrected; the next sync is refused
    [3601, 3602, 3603, 3604, 3605].forEach(function(n) { sync(p, stop(n), st); });
    assert.deepEqual(listed(p), []);
  });

  test('entries saved before board verdicts are kept when they leave the log (upgrade)', async function(assert) {
    var p = service('larry');
    var st = storage({ syncLog: { owner: 'larry', entries: [seen(1)].map(function(e) { var c = Object.assign({}, e); c.finished = c.finished.toISOString(); return c; }) } });
    await restore_sync_log(p, deps(st));
    await restore_board_verdicts(p, deps(st));
    [2, 3, 4, 5, 6].forEach(function(n) { sync(p, stop(n), st); });
    assert.deepEqual(listed(p), [K]);
  });

  test('a restored record is rebuilt with no prototype, so a person named __proto__ is safe', async function(assert) {
    var raw = JSON.parse('{"owner":"larry","verdicts":{"__proto__":{"top":5,"t":{"' + K + '":{"v":false,"n":5}}},"larry":{"top":5,"t":{"' + K + '":{"v":true,"n":5}}}}}');
    var p = service('larry');
    await restore_board_verdicts(p, deps(storage({ [BOARD_VERDICTS_KEY]: raw })));
    assert.deepEqual(listed(p), [K]);
    assert.strictEqual(({})[K], undefined, 'Object.prototype is untouched');
  });

  // Review of the built code (red team, finding 1): a verdict held only in memory (its save failed, or it was folded at
  // restore) is saved by the next sync even when that sync has no verdicts of its own.
  test('a verdict whose save failed is saved by a later sync with no verdicts, so it survives a restart', async function(assert) {
    var saved = null;
    var fail_reads = 1;
    var flaky = {
      store: function(s, record, key) { if(key === BOARD_VERDICTS_KEY) { saved = JSON.parse(JSON.stringify(record.raw)); } return RSVP.resolve(record); },
      find: function(s, key) {
        if(key !== BOARD_VERDICTS_KEY) { return RSVP.reject({ error: 'no record found for settings:' + key }); }
        if(fail_reads > 0) { fail_reads--; return RSVP.reject({ error: 'db transaction error' }); }
        return saved ? RSVP.resolve({ raw: saved }) : RSVP.reject({ error: 'no record found for settings:' + key });
      }
    };
    var stored_answer = { owner: 'larry', verdicts: { larry: { top: at + 1000, t: { [K]: { v: true, n: at + 1000 } } } } };
    saved = stored_answer;
    var p = service('larry');
    sync(p, refused(2), flaky); // its save's read fails
    await new RSVP.Promise(function(r) { setTimeout(r, 10); });
    [3, 4, 5, 6, 7].forEach(function(n) { sync(p, { user_id: 'larry', canceled: true, confirmed: true, finished: new Date(at + n * 1000), statuses: [] }, flaky); });
    await new RSVP.Promise(function(r) { setTimeout(r, 20); });
    var restarted = service('larry');
    await restore_board_verdicts(restarted, deps(flaky));
    assert.deepEqual(listed(restarted), [], 'the refusal was saved after all');
  });

  test('entries saved before board verdicts are saved as verdicts by the next sync, so they survive a restart (upgrade)', async function(assert) {
    var p = service('larry');
    var st = storage({ syncLog: { owner: 'larry', entries: [seen(1)].map(function(e) { var c = Object.assign({}, e); c.finished = c.finished.toISOString(); return c; }) } });
    await restore_sync_log(p, deps(st));
    await restore_board_verdicts(p, deps(st));
    [2, 3, 4, 5, 6].forEach(function(n) { sync(p, stop(n), st); });
    await new RSVP.Promise(function(r) { setTimeout(r, 20); });
    var written = st.calls.stored.filter(function(c) { return c.key === BOARD_VERDICTS_KEY; }).pop();
    assert.ok(written, 'written');
    var restarted = service('larry');
    await restore_board_verdicts(restarted, deps(storage({ [BOARD_VERDICTS_KEY]: written.record.raw })));
    assert.deepEqual(listed(restarted), [K]);
  });

  // Red team, finding 2a: after a save, memory holds the merged record, so a later sync's sequence number is above the
  // stored ones even without a restore.
  test('after a save, memory holds the merged record', async function(assert) {
    var Q = 'aaron/colors';
    var st = storage({ [BOARD_VERDICTS_KEY]: { owner: 'larry', verdicts: { larry: { top: at + 9000, t: { [K]: { v: true, n: at + 9000 } } } } } });
    var p = service('larry');
    sync(p, whole(2, [{ id: Q, key: Q, status: 're-downloaded' }], [Q]), st);
    await new RSVP.Promise(function(r) { setTimeout(r, 10); });
    assert.deepEqual(listed(p), [K], 'the stored answer is in memory now');
    sync(p, refused(3), st);
    assert.true(p.get('sync_log')[p.get('sync_log').length - 1].seq > at + 9000, 'a later sync numbers above the stored record');
    assert.deepEqual(listed(p), []);
  });
});
