import {
  describe,
  it,
  expect,
  beforeEach,
  waitsFor,
  runs,
  stub
} from 'frontend/tests/helpers/jasmine';
import dbman from '../../utils/dbman';

// A whole-table read on the sqlite plugin used to be one SELECT whose entire result the native
// plugin serialises as one string; on Android a 153 MB board table killed the app with an
// OutOfMemoryError on every launch (lingolinq_mobile#3). These drive the real dbman module
// against a fake database that answers the SQL it is sent, and check that no single call returns
// more than the read budget, whatever the row sizes.
describe('dbman sqlite batched reads', function() {
  var tables, calls, fail_on;

  // Stored records keep the store-prefixed id (dbman.uniqify_key); find_all strips it afterwards.
  var row_data = function(id, filler_length, extra) {
    var data = {id: id, raw: new Array(filler_length + 1).join('x')};
    for(var key in (extra || {})) { data[key] = extra[key]; }
    return JSON.stringify(data);
  };
  var add_row = function(table, ref_id, data, key_id) {
    tables[table] = tables[table] || [];
    tables[table].push({id: tables[table].length + 1, ref_id: ref_id, data: data, key_id: key_id});
  };
  var returned_chars = function(rows) {
    var total = 0;
    rows.forEach(function(row) {
      for(var key in row) { if(typeof row[key] == 'string') { total = total + row[key].length; } }
    });
    return total;
  };
  var in_list = function(sql, column) {
    var match = sql.match(new RegExp(column + ' IN \\(([?,]*)\\)'));
    return match ? match[1].split(',').filter(function(p) { return p == '?'; }).length : null;
  };

  // Answers the statements dbman sends, from `tables`. Anything it does not recognise fails the call.
  var fake_db = {
    executeSql: function(sql, args, success, error) {
      args = args || [];
      calls.push({sql: sql, args: args.slice(0)});
      var reply = function(rows) {
        calls[calls.length - 1].rows = rows;
        setTimeout(function() {
          success({rows: {length: rows.length, item: function(i) { return rows[i]; }}});
        }, 0);
      };
      if(fail_on && sql.match(fail_on)) {
        fail_on = null;
        setTimeout(function() { error({message: 'disk I/O error'}); }, 0);
        return;
      }
      var match = sql.match(/FROM (\w+)/);
      var rows = (match && tables[match[1]]) || [];
      var filter = function(list) {
        var ref_count = in_list(sql, 'ref_id'), key_count = in_list(sql, 'key_id'), id_count = in_list(sql, 'id');
        if(ref_count !== null) {
          var refs = args.slice(0, ref_count);
          list = list.filter(function(r) { return refs.indexOf(r.ref_id) != -1; });
        } else if(key_count !== null) {
          var keys = args.slice(0, key_count);
          list = list.filter(function(r) { return keys.indexOf(r.key_id) != -1; });
        } else if(id_count !== null) {
          var ids = args.slice(0, id_count);
          list = list.filter(function(r) { return ids.indexOf(r.id) != -1; });
        }
        return list;
      };
      var substr = sql.match(/^SELECT substr\(data, \?, \?\) AS part FROM \w+ WHERE id = \?$/);
      if(sql.match(/^SELECT id, length\(data\) AS len FROM \w+/)) {
        reply(filter(rows).map(function(r) { return {id: r.id, len: r.data.length}; }));
      } else if(substr) {
        var row = rows.filter(function(r) { return r.id == args[2]; })[0];
        reply(row ? [{part: row.data.substr(args[0] - 1, args[1])}] : []);
      } else if(sql.match(/^SELECT \* FROM \w+/)) {
        reply(filter(rows).map(function(r) { return {id: r.id, ref_id: r.ref_id, data: r.data, key_id: r.key_id}; }));
      } else {
        setTimeout(function() { error({message: 'unexpected statement: ' + sql}); }, 0);
      }
    }
  };
  // Like the shell's bridge (lingolinq_mobile www/sqlite_bridge.js), a transaction holds the one
  // statement queue for all of its statements, so no other call runs between them.
  var base_execute = fake_db.executeSql;
  fake_db.transaction = function(fn, error, success) {
    var ops = [];
    fn({executeSql: function(sql, args, ok, fail) { ops.push({sql: sql, args: args, ok: ok, fail: fail}); }});
    var run_op = function(idx) {
      if(idx >= ops.length) { return setTimeout(function() { if(success) { success(); } }, 0); }
      var op = ops[idx];
      base_execute.call(fake_db, op.sql, op.args, function(rs) {
        if(op.ok) { op.ok(null, rs); }
        run_op(idx + 1);
      }, function(err) {
        if(op.fail) { op.fail(null, err); }
        if(error) { error(err); }
      });
    };
    run_op(0);
  };

  var run_find_all = function(store, index, key) {
    var result = {done: false};
    dbman.find_all_internal(store, index, key, function(list) {
      result.calls = (result.calls || 0) + 1;
      result.list = list;
      result.done = true;
    }, function(err) {
      result.errors = (result.errors || 0) + 1;
      result.error = err;
      result.done = true;
    });
    return result;
  };

  beforeEach(function() {
    tables = {};
    calls = [];
    fail_on = null;
    stub(dbman, 'db_type', 'sqlite_plugin');
    stub(dbman, 'db', fake_db);
    stub(dbman, 'read_budget', 1000);
    stub(dbman, 'ids_per_batch', 3);
  });

  it("returns every row of a whole-table read without any call returning more than the budget", function() {
    add_row('board', 'board::1_1', row_data('board::1_1', 250));
    add_row('board', 'board::1_2', row_data('board::1_2', 250));
    add_row('board', 'board::1_3', row_data('board::1_3', 250));
    add_row('board', 'board::1_4', row_data('board::1_4', 2500));
    add_row('board', 'board::1_5', row_data('board::1_5', 50));
    var result = run_find_all('board');
    waitsFor(function() { return result.done; });
    runs(function() {
      expect(result.errors).toEqual(undefined);
      expect(result.list.map(function(r) { return r.data.id; }).sort()).toEqual(['board::1_1', 'board::1_2', 'board::1_3', 'board::1_4', 'board::1_5']);
      // The oversized row is reassembled exactly.
      var big = result.list.filter(function(r) { return r.data.id == 'board::1_4'; })[0];
      expect(big.data.raw.length).toEqual(2500);
      calls.forEach(function(call) {
        expect(returned_chars(call.rows || []) <= 1000).toEqual(true);
      });
    });
  });

  // Another write (a sync storing the same board) can run between any two of this read's calls,
  // as the bridge runs one call at a time from one queue. An oversized row must come back whole,
  // as it was or as it became, never as a mix of the two.
  describe("when an oversized row is rewritten during the read", function() {
    var old_data, new_data;
    var rewrite_before_call = function(n) {
      var top_level = 0;
      var maybe_write = function() {
        top_level++;
        if(top_level == n) { tables.board[0].data = new_data; }
      };
      var real_execute = fake_db.executeSql, real_transaction = fake_db.transaction;
      stub(fake_db, 'executeSql', function() { maybe_write(); return real_execute.apply(fake_db, arguments); });
      stub(fake_db, 'transaction', function() { maybe_write(); return real_transaction.apply(fake_db, arguments); });
    };
    beforeEach(function() {
      old_data = row_data('board::1_1', 2500, {v: 1});
      new_data = row_data('board::1_1', 3200, {v: 2});
      add_row('board', 'board::1_1', old_data, 'example/one');
    });

    it("reports one error and no success when reading a piece fails", function() {
      fail_on = /^SELECT substr\(data/;
      var result = run_find_all('board');
      waitsFor(function() { return result.done; });
      runs(function() {
        expect(result.errors).toEqual(1);
        expect(result.calls).toEqual(undefined);
      });
    });

    it("returns the row whole when the write lands right after the size query", function() {
      rewrite_before_call(2);
      var result = run_find_all('board');
      waitsFor(function() { return result.done; });
      runs(function() {
        expect(result.errors).toEqual(undefined);
        expect(result.list.length).toEqual(1);
        var data = result.list[0] && result.list[0].data;
        expect(!!data && JSON.stringify(data) === new_data).toEqual(true);
      });
    });

    it("returns the row whole when the write lands between its pieces", function() {
      rewrite_before_call(3);
      var result = run_find_all('board');
      waitsFor(function() { return result.done; });
      runs(function() {
        expect(result.errors).toEqual(undefined);
        expect(result.list.length).toEqual(1);
        var data = result.list[0] && result.list[0].data;
        expect(!!data && (JSON.stringify(data) === old_data || JSON.stringify(data) === new_data)).toEqual(true);
      });
    });
  });

  it("never sends more ids in one batch than the cap", function() {
    for(var idx = 1; idx <= 10; idx++) {
      add_row('image', 'image::1_' + idx, row_data('image::1_' + idx, 5));
    }
    var result = run_find_all('image');
    waitsFor(function() { return result.done; });
    runs(function() {
      expect(result.list.length).toEqual(10);
      calls.forEach(function(call) {
        var count = in_list(call.sql, 'id');
        if(count !== null) { expect(count <= 3).toEqual(true); }
      });
    });
  });

  it("keeps the WHERE of a read by id, in the size query as well", function() {
    add_row('board', 'board::1_1', row_data('board::1_1', 10));
    add_row('board', 'board::1_2', row_data('board::1_2', 10));
    add_row('board', 'board::1_3', row_data('board::1_3', 10));
    var result = run_find_all('board', 'id', ['board::1_1', 'board::1_3']);
    waitsFor(function() { return result.done; });
    runs(function() {
      expect(result.list.map(function(r) { return r.data.id; }).sort()).toEqual(['board::1_1', 'board::1_3']);
      var size_query = calls.filter(function(c) { return c.sql.match(/length\(data\)/); })[0];
      expect(!!size_query).toEqual(true);
      expect(size_query && in_list(size_query.sql, 'ref_id')).toEqual(2);
      expect(size_query && size_query.args).toEqual(['board::1_1', 'board::1_3']);
    });
  });

  it("filters by a non-id index after reading", function() {
    add_row('board', 'board::1_1', row_data('board::1_1', 10, {changed: true}));
    add_row('board', 'board::1_2', row_data('board::1_2', 10, {changed: false}));
    var result = run_find_all('board', 'changed', [true]);
    waitsFor(function() { return result.done; });
    runs(function() {
      expect(result.list.map(function(r) { return r.data.id; })).toEqual(['board::1_1']);
    });
  });

  it("calls success once with an empty list for an empty table", function() {
    var result = run_find_all('board');
    waitsFor(function() { return result.done; });
    runs(function() {
      expect(result.calls).toEqual(1);
      expect(result.list).toEqual([]);
      expect(result.errors).toEqual(undefined);
    });
  });

  it("reports one error and no success when a batch fails part way", function() {
    add_row('board', 'board::1_1', row_data('board::1_1', 600));
    add_row('board', 'board::1_2', row_data('board::1_2', 600));
    add_row('board', 'board::1_3', row_data('board::1_3', 600));
    fail_on = /^SELECT \* FROM board WHERE id IN/;
    // Let the first batch succeed; fail the second.
    var real = fake_db.executeSql;
    var batches = 0;
    stub(fake_db, 'executeSql', function(sql, args, success, error) {
      if(sql.match(/^SELECT \* FROM board WHERE id IN/)) {
        batches++;
        if(batches == 1) { fail_on = null; } else { fail_on = /^SELECT \* FROM board WHERE id IN/; }
      }
      return real.call(fake_db, sql, args, success, error);
    });
    var result = run_find_all('board');
    waitsFor(function() { return result.done; });
    runs(function() {
      expect(batches >= 2).toEqual(true);
      expect(result.errors).toEqual(1);
      expect(result.calls).toEqual(undefined);
    });
  });
});
