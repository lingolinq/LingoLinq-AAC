import { module, test } from 'qunit';
import { installCapacitorSqliteShim } from 'frontend/utils/capacitor_sqlite_shim';

/* THE BACKUP SQLITE SHIM DROPS THE iOS COLUMN-LIST ROW (#1206, PR #1268).
 *
 * On iOS, @capacitor-community/sqlite puts a column-list row ({ios_columns: [...]}) first in every non-empty
 * query result (ios/Plugin/Utils/UtilsSQLCipher.swift); the plugin's own JS wrapper drops it (reorderRows in
 * dist/plugin.js). Both LingoLinq bridges call the raw plugin. The shell's bridge (lingolinq_mobile
 * www/sqlite_bridge.js, cc94c74) drops the row; this backup shim, which installs only when the shell's bridge is
 * missing, passed it through as data. These cases are the shell's (lingolinq_mobile test/sqlite_bridge.test.js),
 * run against the shim through the same Cordova-shaped API dbman uses.
 */
module('Unit | Utility | capacitor sqlite shim', function(hooks) {
  var saved = {};

  // A fake native Capacitor whose SQLite plugin answers every query with `values`. The plugin refuses anything
  // but an array of values, as the real one does ("Query: Must provide an Array of value").
  function install(values, opts) {
    var calls = [];
    var fakePlugin = {
      checkConnectionsConsistency: function() { return Promise.resolve({ result: true }); },
      closeConnection: function() { return Promise.resolve(); },
      createConnection: function() { return Promise.resolve(); },
      open: function() { return Promise.resolve(); },
      query: function(o) {
        calls.push(o);
        if(!Array.isArray(o.values)) { return Promise.reject(new Error('Query: Must provide an Array of value')); }
        if(opts && opts.failQuery) { return Promise.reject(new Error('no such table: board')); }
        return Promise.resolve({ values: values });
      },
      run: function() { return Promise.resolve({ changes: { changes: 0 } }); }
    };
    window.Capacitor = { isNativePlatform: function() { return true; }, Plugins: { CapacitorSQLite: fakePlugin } };
    var installed = installCapacitorSqliteShim();
    if(!installed) { throw new Error('the shim did not install'); }
    return { db: window.sqlitePlugin.openDatabase({ name: 'test' }), calls: calls };
  }

  function select(db, sql) {
    return new Promise(function(resolve, reject) { db.executeSql(sql, [], resolve, reject); });
  }

  // dbman reads the schema version inside a transaction (utils/dbman.js).
  function selectInTransaction(db, sql) {
    return new Promise(function(resolve, reject) {
      var result = null;
      db.transaction(function(tx) {
        tx.executeSql(sql, [], function(_tx, rs) { result = rs; });
      }, reject, function() { resolve(result); });
    });
  }

  function rowsOf(rs) {
    var rows = [];
    for(var i = 0; i < rs.rows.length; i++) { rows.push(rs.rows.item(i)); }
    return rows;
  }

  hooks.beforeEach(function() {
    saved.capacitor = Object.getOwnPropertyDescriptor(window, 'Capacitor');
    saved.sqlitePlugin = Object.getOwnPropertyDescriptor(window, 'sqlitePlugin');
    delete window.sqlitePlugin;
  });

  hooks.afterEach(function() {
    // Put window back exactly as it was: these are own properties the test created.
    ['Capacitor', 'sqlitePlugin'].forEach(function(name) {
      var own = saved[name === 'Capacitor' ? 'capacitor' : 'sqlitePlugin'];
      if(own) { Object.defineProperty(window, name, own); } else { delete window[name]; }
    });
  });

  test('iOS-shaped result: the ios_columns row is not returned as data', async function(assert) {
    var rs = await select(install([{ ios_columns: ['version'] }, { version: '4' }]).db, 'SELECT * FROM version');
    assert.strictEqual(rs.rows.length, 1);
    assert.deepEqual(rowsOf(rs), [{ version: '4' }]);
  });

  test('iOS-shaped result with several rows keeps every real row in order', async function(assert) {
    var rs = await select(install([
      { ios_columns: ['ref_id', 'data'] },
      { ref_id: 'a', data: '{"id":"a"}' },
      { ref_id: 'b', data: '{"id":"b"}' }
    ]).db, 'SELECT * FROM board');
    assert.deepEqual(rowsOf(rs), [{ ref_id: 'a', data: '{"id":"a"}' }, { ref_id: 'b', data: '{"id":"b"}' }]);
  });

  test('iOS-shaped result read inside a transaction (the version check) has no ios_columns row', async function(assert) {
    var rs = await selectInTransaction(install([{ ios_columns: ['version'] }, { version: '4' }]).db, 'SELECT * FROM version');
    assert.strictEqual(rs.rows.length, 1);
    assert.strictEqual(rs.rows.item(0).version, '4');
  });

  test('PRAGMA results get the same handling', async function(assert) {
    var rs = await select(install([{ ios_columns: ['name'] }, { name: 'data' }]).db, 'PRAGMA table_info(board)');
    assert.deepEqual(rowsOf(rs), [{ name: 'data' }]);
  });

  test('Android-shaped result (no ios_columns row) is returned unchanged', async function(assert) {
    var rows = [{ ref_id: 'a', data: '{"id":"a"}' }, { ref_id: 'b', data: '{"id":"b"}' }];
    var rs = await select(install(rows.map(function(r) { return Object.assign({}, r); })).db, 'SELECT * FROM board');
    assert.deepEqual(rowsOf(rs), rows);
  });

  test('a real column named ios_columns (not the iOS marker) is kept as data', async function(assert) {
    var rows = [{ ios_columns: 'a real value' }, { ios_columns: 'another' }];
    var rs = await select(install(rows.map(function(r) { return Object.assign({}, r); })).db, 'SELECT note AS ios_columns FROM t');
    assert.deepEqual(rowsOf(rs), rows);
  });

  test('missing, non-array or null-first values do not throw', async function(assert) {
    assert.expect(4);
    var inputs = [undefined, null, 'not an array', [null, { version: '4' }]];
    for(var i = 0; i < inputs.length; i++) {
      delete window.sqlitePlugin;
      var rs = await select(install(inputs[i]).db, 'SELECT * FROM version');
      assert.strictEqual(rs.rows.length, Array.isArray(inputs[i]) ? inputs[i].length : 0, 'input ' + i);
    }
  });

  test('empty result stays empty', async function(assert) {
    var rs = await select(install([]).db, 'SELECT * FROM version');
    assert.strictEqual(rs.rows.length, 0);
  });

  // The sync checks the database with the short Cordova form executeSql(sql, success, error)
  // (services/persistence.js) and calls abortAllPendingTransactions when the check is slow.
  test('short form executeSql(sql, success, error) runs with no values and calls success', async function(assert) {
    var made = install([{ ios_columns: ['id'] }, { id: 1 }]);
    var rs = await new Promise(function(resolve, reject) { made.db.executeSql('SELECT * FROM board LIMIT 1', resolve, reject); });
    assert.strictEqual(rs.rows.length, 1);
    assert.true(Array.isArray(made.calls[0].values));
    assert.strictEqual(made.calls[0].values.length, 0);
  });

  test('short form executeSql calls its error callback (third argument) on failure', async function(assert) {
    var db = install([], { failQuery: true }).db;
    var outcome = await new Promise(function(resolve) {
      db.executeSql('SELECT * FROM board LIMIT 1', function() { resolve('success'); }, function(err) { resolve('error: ' + err.message); });
    });
    assert.strictEqual(outcome, 'error: no such table: board');
  });

  test('full form with a non-array values argument reports through the error callback', async function(assert) {
    var db = install([]).db;
    var err = await new Promise(function(resolve) {
      db.executeSql('SELECT * FROM board', 'not-an-array', function() { resolve(null); }, resolve);
    });
    assert.true(!!(err && /Array/.test(err.message)));
  });

  test('abortAllPendingTransactions exists and does not throw', function(assert) {
    var db = install([]).db;
    assert.strictEqual(typeof db.abortAllPendingTransactions, 'function');
    db.abortAllPendingTransactions();
    assert.ok(true, 'did not throw');
  });

  test('a failed query reaches the error callback', async function(assert) {
    var db = install([], { failQuery: true }).db;
    var outcome = await new Promise(function(resolve) {
      db.executeSql('SELECT * FROM board', [], function() { resolve('success'); }, function(err) { resolve('error: ' + err.message); });
    });
    assert.strictEqual(outcome, 'error: no such table: board');
  });
});
