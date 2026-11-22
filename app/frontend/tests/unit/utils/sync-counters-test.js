import { module, test } from 'qunit';
import { begin, token, request_started, request_ended, note_failure, media_saved, board_fetched, finish, failure_kind, FAILURE_KINDS, reset_for_tests, base64_bytes } from 'frontend/utils/sync_counters';

/* SYNC COUNTERS (item 0.1 of the sync proposal, docs/task-management/2026-11-20_sync-proposal-implementation.md):
 * what one root sync asked for and got, kept on its log entry for support. Counting is on only while the sync it
 * belongs to is the one running, and a request counts only against the sync that started it. */
module('Unit | Utility | sync counters', function(hooks) {
  hooks.beforeEach(function() { reset_for_tests(); });
  hooks.afterEach(function() { reset_for_tests(); });

  function running(sync_id) {
    return { get: function(key) { return key === 'sync_progress.sync_id' ? sync_id : null; } };
  }

  test('nothing counts when no sync has begun', function(assert) {
    assert.strictEqual(token(running('s1')), null);
    assert.strictEqual(request_started(token(running('s1'))), null);
    assert.strictEqual(finish('s1'), null);
  });

  test('counts requests, characters received, the peak at once and the start time', function(assert) {
    begin('s1', 1000);
    var t = token(running('s1'));
    assert.strictEqual(t, 's1');
    var a = request_started(t);
    var b = request_started(t);
    request_ended(a, { status: 200, chars: 300 });
    var c = request_started(t);
    request_ended(b, { status: 200, chars: 50 });
    request_ended(c, { status: 200 });
    var out = finish('s1', { now: 61000 });
    assert.strictEqual(out.started, 1000);
    assert.strictEqual(out.seconds, 60);
    assert.strictEqual(out.requests, 3);
    assert.strictEqual(out.peak, 2);
    assert.strictEqual(out.received_chars, 350);
    assert.strictEqual(finish('s1'), null, 'finished once');
  });

  test('counting is off while another sync, or none, is running', function(assert) {
    begin('s1', 1000);
    assert.strictEqual(token(running('s2')), null, 'a different sync is running');
    assert.strictEqual(token(running(null)), null, 'the sync was cleared without a log entry');
    assert.strictEqual(token(null), null);
  });

  test('a request from an earlier sync never counts against the next one', function(assert) {
    begin('s1', 1000);
    var old = request_started(token(running('s1')));
    begin('s2', 2000);
    var t = token(running('s2'));
    var mine = request_started(t);
    request_ended(old, { status: 0, chars: 999 });
    request_ended(mine, { status: 200, chars: 10 });
    var out = finish('s2', { now: 3000 });
    assert.strictEqual(out.requests, 1);
    assert.strictEqual(out.received_chars, 10);
    assert.strictEqual(out.failures.offline, 0, "the old request's failure is not this sync's");
    assert.strictEqual(out.open_at_end, 0);
  });

  test('ending a request twice never takes the open count below zero', function(assert) {
    begin('s1', 0);
    var a = request_started(token(running('s1')));
    request_ended(a, { status: 200 });
    request_ended(a, { status: 200 });
    var b = request_started(token(running('s1')));
    var c = request_started(token(running('s1')));
    request_ended(b, { status: 200 });
    request_ended(c, { status: 200 });
    var out = finish('s1', { now: 0 });
    assert.strictEqual(out.peak, 2);
    assert.strictEqual(out.open_at_end, 0);
  });

  test('failure kinds come from a closed list', function(assert) {
    assert.deepEqual(FAILURE_KINDS, ['timeout', 'offline', 'limited', 'server', 'refused', 'storage', 'supervisee', 'other']);
    assert.strictEqual(failure_kind(0), 'offline');
    assert.strictEqual(failure_kind(429), 'limited');
    assert.strictEqual(failure_kind(503), 'server');
    assert.strictEqual(failure_kind(404), 'refused');
    assert.strictEqual(failure_kind(400), 'refused');
    assert.strictEqual(failure_kind(200), null);
    assert.strictEqual(failure_kind(302), null);
    begin('s1', 0);
    var t = token(running('s1'));
    request_ended(request_started(t), { status: 0 });
    request_ended(request_started(t), { status: 504 });
    request_ended(request_started(t), { status: 403 });
    request_ended(request_started(t), { failure: 'timeout' });
    note_failure(t, 'supervisee');
    note_failure(t, 'offline');
    note_failure(t, 'https://example.com/pic.png?user_token=abc');
    var out = finish('s1', { now: 0, storage_failures: 2 });
    assert.deepEqual(out.failures, { timeout: 1, offline: 2, limited: 0, server: 1, refused: 1, storage: 2, supervisee: 1, other: 1 });
    assert.notOk(JSON.stringify(out).match(/example\.com|user_token/), 'no url or error text is kept');
  });

  test('pictures and sounds saved, with their bytes; nothing else counts as one', function(assert) {
    begin('s1', 0);
    var t = token(running('s1'));
    media_saved(t, 'image', 16000);
    media_saved(t, 'image', 4000);
    media_saved(t, 'sound', 9000);
    media_saved(t, 'json', 50000);
    media_saved(null, 'image', 1);
    var out = finish('s1', { now: 0 });
    assert.deepEqual(out.pictures, { saved: 2, bytes: 20000 });
    assert.deepEqual(out.sounds, { saved: 1, bytes: 9000 });
  });

  test('boards the server sent', function(assert) {
    begin('s1', 0);
    var t = token(running('s1'));
    board_fetched(t);
    board_fetched(t);
    board_fetched(null);
    board_fetched('s2');
    assert.deepEqual(finish('s1', { now: 0 }).boards, { fetched: 2 });
  });

  test('the result is plain JSON that survives a save', function(assert) {
    begin('s1', 5);
    request_ended(request_started(token(running('s1'))), { status: 200, chars: 1 });
    var out = finish('s1', { now: 10 });
    assert.deepEqual(JSON.parse(JSON.stringify(out)), out);
  });

  test('bad input never throws', function(assert) {
    begin('s1', 0);
    request_ended({ sync_id: 's1' }, null);
    request_ended('nonsense', { status: 'x', chars: 'many' });
    request_ended(undefined, undefined);
    note_failure(undefined, undefined);
    media_saved('s1', 'image', 'big');
    var out = finish('s1', { now: 0 });
    assert.ok(out, 'still finishes');
    assert.strictEqual(out.pictures.bytes, 0, 'a byte count that is not a number adds nothing');
    assert.strictEqual(out.received_chars, 0);
  });

  test('the decoded size of a base64 answer', function(assert) {
    assert.strictEqual(base64_bytes('data:image/png;base64,iVBORw0KGgo='), 8);
    assert.strictEqual(base64_bytes('data:image/png;base64,iVBORw0KGg=='), 7);
    assert.strictEqual(base64_bytes('data:text/plain;base64,YWJj'), 3);
    assert.strictEqual(base64_bytes(null), 0);
  });
});
