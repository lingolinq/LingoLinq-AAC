import { module, test } from 'qunit';
import dbman from 'frontend/utils/dbman';

/* ONE ROW PER RECORD ON SQLITE (2026-11-08, PR #1268, issue #1221).
 *
 * On the installed app a write is two statements: a SELECT for the row, then an UPDATE or an INSERT.
 * The SQLite bridge runs statements one at a time but each one is queued on its own
 * (utils/capacitor_sqlite_shim.js executeSql), so a second write of the same record could queue its
 * SELECT between the first write's SELECT and INSERT: both saw no row and both inserted, and the record
 * was stored twice. The table has no unique key on ref_id to stop it.
 *
 * A stand-in database answers each statement asynchronously, in the order queued, like the shim.
 */
function fakeSqlite() {
  var db = { rows: [], next_id: 1 };
  var queue = Promise.resolve();
  db.executeSql = function(sql, args, ok, fail) {
    queue = queue.then(function() {
      return new Promise(function(resolve) { setTimeout(resolve, 1); });
    }).then(function() {
      var ref_id = args[args.length - 1];
      var matching = db.rows.filter(function(r) { return r.ref_id === ref_id; });
      if(db.drop_next) { db.drop_next = false; return; } // a bridge that never answers this statement
      if(/^SELECT/.test(sql)) {
        ok({ rows: { length: matching.length, item: function(i) { return matching[i]; } } });
      } else if(/^INSERT/.test(sql)) {
        db.rows.push({ id: db.next_id++, data: args[0], ref_id: ref_id });
        ok({ rows: { length: 0 } });
      } else if(/^UPDATE/.test(sql)) {
        matching.forEach(function(r) { r.data = args[0]; });
        ok({ rows: { length: 0 } });
      } else if(/^DELETE/.test(sql)) {
        db.rows = db.rows.filter(function(r) { return r.ref_id !== ref_id; });
        ok({ rows: { length: 0 } });
      } else {
        fail({ message: 'unexpected ' + sql });
      }
    }).catch(function() { }); // like the bridges, a callback that throws does not stop the queue
  };
  return db;
}

module('Unit | Utility | dbman sqlite row writes', function(hooks) {
  hooks.beforeEach(function() {
    this.prior = { db: dbman.db, type: dbman.db_type, watchdog: dbman.row_write_watchdog_ms };
    this.db = fakeSqlite();
    dbman.db = this.db;
    dbman.db_type = 'sqlite_plugin';
  });

  hooks.afterEach(function() {
    dbman.db = this.prior.db;
    dbman.db_type = this.prior.type;
    dbman.row_write_watchdog_ms = this.prior.watchdog;
  });

  // Through dbman.store, as the app does: the row is keyed 'dataCache::<id>'.
  function store(record) {
    return new Promise(function(resolve, reject) {
      dbman.store('dataCache', { id: record.id, raw: { v: record.v } }, resolve, reject);
    });
  }
  function rowsFor(db, id) {
    return db.rows.filter((r) => r.ref_id === 'dataCache::' + id);
  }
  function valueOf(row) {
    return JSON.parse(JSON.parse(row.data).raw).v;
  }
  // Through dbman.remove, the route every removal takes (capabilities.storage_remove): it looks the row up
  // first and deletes only when found, so a lookup that ran before a pending insert used to miss it.
  function remove(id) {
    return new Promise(function(resolve, reject) {
      dbman.remove('dataCache', id, resolve, reject);
    });
  }

  test('two writes of the same record at once leave one row, holding the later one', async function(assert) {
    await Promise.all([store({ id: 'chunk_1', v: 1 }), store({ id: 'chunk_1', v: 2 })]);
    const rows = rowsFor(this.db, 'chunk_1');
    assert.strictEqual(rows.length, 1, 'stored once');
    assert.strictEqual(valueOf(rows[0]), 2, 'the later write wins');
  });

  test('writes of different records are all stored', async function(assert) {
    await Promise.all([store({ id: 'a', v: 1 }), store({ id: 'b', v: 1 }), store({ id: 'a', v: 2 })]);
    assert.deepEqual(this.db.rows.map((r) => r.ref_id).sort(), ['dataCache::a', 'dataCache::b']);
  });

  test('a removal asked for after a write leaves no row', async function(assert) {
    await Promise.all([store({ id: 'gone', v: 1 }), remove('gone')]);
    assert.strictEqual(rowsFor(this.db, 'gone').length, 0);
  });

  test('a record written again later is updated in place', async function(assert) {
    await store({ id: 'later', v: 1 });
    await store({ id: 'later', v: 2 });
    const rows = rowsFor(this.db, 'later');
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(valueOf(rows[0]), 2);
  });

  test('a statement the bridge never answers does not hold up later writes of that row for good', async function(assert) {
    dbman.row_write_watchdog_ms = 30;
    this.db.drop_next = true;
    store({ id: 'stuck', v: 1 }); // never answered
    await store({ id: 'stuck', v: 2 });
    const rows = rowsFor(this.db, 'stuck');
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(valueOf(rows[0]), 2);
  });

  test('a record that cannot be saved is reported as failed, and the row is freed', async function(assert) {
    assert.expect(2);
    const record = { id: 'bad', raw: {} };
    const unsaveable = { id: 'bad' };
    unsaveable.self = unsaveable; // cannot be turned into JSON
    await new Promise((resolve) => {
      dbman.store_internal('dataCache', Object.assign(record, { extra: unsaveable }), () => { assert.ok(false, 'reported as saved'); resolve(); }, (err) => {
        assert.true(!!(err && err.error), 'reported as failed');
        resolve();
      });
    });
    await store({ id: 'bad', v: 2 });
    assert.strictEqual(valueOf(rowsFor(this.db, 'bad')[0]), 2, 'a later save of the row still runs');
  });
});
