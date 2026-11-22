import { module, test } from 'qunit';
import RSVP from 'rsvp';
import { copy_from_this_sync, stored_this_sync, note_answered, answered_refs } from 'frontend/utils/sync_board_fallback';

/* A BOARD SAVED LATE IN A SYNC IS NOT DOWNLOADED AGAIN BY THE SAME SYNC
 * (docs/task-management/2026-11-16_sync-late-copy-current.md).
 *
 * On a slow link a board's request outlives the adapter's 15 s limit, the sync parks the board, and the late answer
 * is still saved to the device. The parked board's retry then found that copy older than the 5-minute freshness
 * window and downloaded the whole board again by key (0.8 Mbps: 80.6 MB instead of 43 MB). A complete copy the device
 * stored during this sync is current for this sync. */
module('Unit | Utility | sync board fallback: copies stored during this sync', function() {
  var MIN = 60 * 1000;
  var now = (new Date()).getTime();
  function progress(extra) {
    return Object.assign({ started_at: now - 10 * MIN, device_boards: {}, device_boards_read_at: now - 10 * MIN + 1000, retried_lookups: { '1_7': 1 } }, extra || {});
  }
  function row(extra) {
    return Object.assign({ id: '1_7', key: 'example/late', buttons: [], permissions: { view: true }, image_urls: {}, retrieved: now - 6 * MIN }, extra || {});
  }

  test('a complete copy stored after the sync started is from this sync', function(assert) {
    assert.true(copy_from_this_sync(progress(), row()));
  });

  test('a stamp equal to the start of the window counts', function(assert) {
    var p = progress();
    assert.true(copy_from_this_sync(p, row({ retrieved: p.device_boards_read_at })));
  });

  test('a copy stored before the sync started is not', function(assert) {
    assert.false(copy_from_this_sync(progress(), row({ retrieved: now - 11 * MIN })));
  });

  // known_on_device's rule (#1212): a stamp from before the device read proves nothing.
  test('the window starts at the later of the start and the device read', function(assert) {
    var p = progress({ device_boards_read_at: now - 7 * MIN });
    assert.false(copy_from_this_sync(p, row({ retrieved: now - 8 * MIN })), 'after the start, before the device read');
    assert.true(copy_from_this_sync(p, row({ retrieved: now - 7 * MIN })));
    assert.true(copy_from_this_sync(progress({ device_boards_read_at: undefined }), row()), 'no device read: the start alone');
  });

  test('nothing counts without a start time or a stamp', function(assert) {
    assert.false(copy_from_this_sync(progress({ started_at: undefined }), row()), 'no start time');
    assert.false(copy_from_this_sync(progress(), row({ retrieved: undefined })), 'no stamp');
    assert.false(copy_from_this_sync(null, row()), 'no sync');
    assert.false(copy_from_this_sync(progress(), null), 'no row');
  });

  test('a partial copy does not count', function(assert) {
    assert.false(copy_from_this_sync(progress(), row({ permissions: undefined })), 'no permissions');
    assert.false(copy_from_this_sync(progress(), row({ image_urls: undefined })), 'no image urls');
    assert.false(copy_from_this_sync(progress(), row({ buttons: undefined })), 'no buttons');
    assert.false(copy_from_this_sync(progress(), row({ key: undefined })), 'no key');
  });

  function record(id) { return { get: function(attr) { return attr === 'global_id' || attr === 'id' ? id : undefined; } }; }

  // The server's revisions list is judged against the row being used, not the record in memory: a lite record from a
  // /tree answer may carry no revision at all.
  test('a listed revision must match the copy', function(assert) {
    assert.true(copy_from_this_sync(progress(), row({ current_revision: 'r1' }), 'r1'), 'the same revision');
    assert.false(copy_from_this_sync(progress(), row({ current_revision: 'r1' }), 'r2'), 'the server lists a newer one');
    assert.false(copy_from_this_sync(progress(), row({ current_revision: undefined }), 'r2'), 'the copy has none');
    assert.true(copy_from_this_sync(progress(), row({ current_revision: undefined }), undefined), 'nothing listed');
  });

  test('a listed revision is passed on to the row check', async function(assert) {
    var found = await stored_this_sync(progress(), '1_7', record('1_7'), function() { return RSVP.resolve(row({ current_revision: 'r1' })); }, 'r2');
    assert.strictEqual(found, null);
  });

  test('a retried board reads its device row and answers it when stored during this sync', async function(assert) {
    var reads = [];
    var found = await stored_this_sync(progress(), '1_7', record('1_7'), function(rec) { reads.push(rec.get('id')); return RSVP.resolve(row()); });
    assert.deepEqual(reads, ['1_7']);
    assert.strictEqual((found || {}).id, '1_7');
  });

  test('a board that was not retried is not read', async function(assert) {
    var reads = 0;
    var found = await stored_this_sync(progress({ retried_lookups: {} }), '1_7', record('1_7'), function() { reads++; return RSVP.resolve(row()); });
    assert.strictEqual(found, null);
    assert.strictEqual(reads, 0);
  });

  test('an older row, or none, answers null', async function(assert) {
    assert.strictEqual(await stored_this_sync(progress(), '1_7', record('1_7'), function() { return RSVP.resolve(row({ retrieved: now - 20 * MIN })); }), null);
    assert.strictEqual(await stored_this_sync(progress(), '1_7', record('1_7'), function() { return RSVP.reject({ error: 'no usable copy' }); }), null);
  });
});

/* Which boards the server really answered for in a sync (docs/task-management/2026-11-16_offline-boards-page.md,
 * "Finding 1"). A reload can resolve from the device copy (the adapter's fallback on 5xx, status 0, 401) with its old
 * `retrieved` stamp; only a record stamped after the ask is an answer. The finished entry carries the list
 * (`answered`), so the offline list can tell a server answer from a device copy. */
module('Unit | Utility | sync board fallback: boards the server answered', function() {
  var rec = function(attrs) { return { get: function(k) { return attrs[k]; } }; };
  test('a record stamped after the ask is an answer; an older, missing or future stamp is not', function(assert) {
    var asked = (new Date()).getTime() - 1000; // a second ago, so 'stamped after' is not in the future
    var sp = {};
    note_answered(sp, rec({ id: '1_1', key: 'me/fresh', retrieved: asked + 5 }), asked);
    note_answered(sp, rec({ id: '1_2', key: 'me/device-copy', retrieved: asked - 60000 }), asked);
    note_answered(sp, rec({ id: '1_3', key: 'me/no-stamp' }), asked);
    note_answered(sp, rec({ id: '1_4', key: 'me/future', retrieved: asked + 3600000 }), asked);
    assert.deepEqual(answered_refs(sp).sort(), ['1_1', 'me/fresh']);
  });
  test('a copy this sync stored from a server answer counts without a stamp check; nothing noted is an empty list', function(assert) {
    var sp = {};
    assert.deepEqual(answered_refs(sp), []);
    assert.deepEqual(answered_refs(null), []);
    note_answered(sp, rec({ id: 'other/liked', key: 'other/liked' }));
    assert.deepEqual(answered_refs(sp), ['other/liked']);
  });
});
