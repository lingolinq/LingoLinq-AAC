import { module, test } from 'qunit';
import RSVP from 'rsvp';
import { store_late_board, join_download } from 'frontend/utils/board_download';

/* The pieces of utils/board_download.js the adapter (utils/persistence.js DSExtend findRecord) uses for a board
 * answer that arrives after its caller was answered, and for a second request while a download runs. The adapter
 * path is covered in adapter-board-find-test.js; these cover the rules with the database and clock passed in. */
module('Unit | Utility | board download', function() {
  function deps(row, opts) {
    opts = opts || {};
    var stored = [];
    var token = opts.token || 'tok-1';
    return {
      stored: stored,
      set_token: function(t) { token = t; },
      d: {
        find: function() { return row ? RSVP.resolve({ board: row }) : RSVP.reject({ error: 'record not found' }); },
        store: function(obj) { stored.push(obj); return RSVP.resolve(obj); },
        token: function() { return token; },
        now: function() { return 5000; }
      }
    };
  }
  function answer(extra) {
    return { board: Object.assign({ id: '1_7', key: 'a/b', updated: '2026-11-14T10:00:00Z', local_result: true }, extra || {}),
      images: [{ id: 'i' }], sounds: [{ id: 's' }], image: {}, sound: {} };
  }
  var started = { at: 1000, token: 'tok-1' };

  test('a late answer with no copy on the device is stored, stripped and stamped', async function(assert) {
    var x = deps(null);
    var res = await store_late_board(answer(), '1_7', started, x.d);
    assert.true(res, 'stored');
    assert.strictEqual(x.stored.length, 1);
    var obj = x.stored[0];
    assert.deepEqual(Object.keys(obj), ['board'], 'images, sounds, image and sound removed');
    assert.strictEqual(obj.board.retrieved, 5000, 'stamped with now');
    assert.false('local_result' in obj.board, 'not marked as a device result');
  });

  test('an older copy on the device is replaced', async function(assert) {
    var x = deps({ id: '1_7', updated: '2026-11-13T10:00:00Z', retrieved: 500 });
    assert.true(await store_late_board(answer(), '1_7', started, x.d));
    assert.strictEqual(x.stored.length, 1);
  });

  test('nothing is stored over a pending edit, a revoked mark, a newer copy or a copy fetched since', async function(assert) {
    var rows = [
      ['changed', { id: '1_7', changed: true }],
      ['revoked', { id: '1_7', revoked: true }],
      ['newer updated', { id: '1_7', updated: '2026-11-14T11:00:00Z' }],
      ['fetched after this request started', { id: '1_7', retrieved: 1500 }]
    ];
    assert.expect(rows.length * 2);
    for(var idx = 0; idx < rows.length; idx++) {
      var x = deps(rows[idx][1]);
      assert.false(await store_late_board(answer(), '1_7', started, x.d), rows[idx][0]);
      assert.strictEqual(x.stored.length, 0, rows[idx][0] + ': nothing stored');
    }
  });

  test('nothing is stored after the session changed (sign-out, another person)', async function(assert) {
    var x = deps(null);
    x.set_token('tok-2');
    assert.false(await store_late_board(answer(), '1_7', started, x.d));
    assert.strictEqual(x.stored.length, 0);
  });

  test('one answer is stored once, though several callers were waiting on it', async function(assert) {
    var x = deps(null);
    var a = answer();
    await store_late_board(a, '1_7', started, x.d);
    await store_late_board(a, '1_7', started, x.d);
    assert.strictEqual(x.stored.length, 1);
  });

  test('a request joins a download that is running, and a later one starts a new download', async function(assert) {
    var starts = 0;
    var finish = null;
    var start = function() { starts++; return new RSVP.Promise(function(resolve) { finish = resolve; }); };
    var p1 = join_download('board_1_7', start);
    var p2 = join_download('board_1_7', start);
    assert.strictEqual(starts, 1, 'one download for two requests');
    finish({ ok: 1 });
    assert.deepEqual(await p1, { ok: 1 });
    assert.deepEqual(await p2, { ok: 1 });
    join_download('board_1_7', start);
    assert.strictEqual(starts, 2, 'the finished download is forgotten');
    finish({ ok: 2 });
  });

  test('a failed download is forgotten too, and its failure reaches every request', async function(assert) {
    var fail = null;
    var p1 = join_download('board_1_8', function() { return new RSVP.Promise(function(resolve, reject) { fail = reject; }); });
    var p2 = join_download('board_1_8', function() { return RSVP.resolve('second start'); });
    fail({ error: 'down' });
    await assert.rejects(p1);
    await assert.rejects(p2);
    assert.strictEqual(await join_download('board_1_8', function() { return RSVP.resolve('fresh'); }), 'fresh');
  });
});
