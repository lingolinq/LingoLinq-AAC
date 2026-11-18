import { module, test } from 'qunit';
import RSVP from 'rsvp';
import {
  failure_cause, content_failure, settle_content, claim_content_retry, content_entry, content_error, retry_content
} from 'frontend/utils/board_content_retry';
import { claim_board_retry, MAX_BOARD_RETRIES } from 'frontend/utils/sync_board_fallback';

/* A board's picture or sound cut off by a dropped link (docs/task-management/2026-11-17_sync-picture-after-link-drop.md):
 * only the failed saves are parked and tried again; the walk in services/persistence.js uses these rules. */
module('Unit | Utility | board content retry', function() {
  test('a failure keeps only its status and the offline flag', function(assert) {
    assert.deepEqual(failure_cause({ fakeXHR: { status: 0, responseText: 'secret' }, stack: 'x' }), { fakeXHR: { status: 0 } });
    assert.deepEqual(failure_cause({ offline: true, error: 'not online' }), { offline: true });
    assert.deepEqual(failure_cause({ error: 'bacon' }), {});
    assert.deepEqual(failure_cause(null), {});
    assert.deepEqual(failure_cause('a string'), {});
  });

  test('a content failure passes for a dropped link or offline, not for a picture the server could not get', function(assert) {
    var item = { url: 'http://example.com/a.png', type: 'image', keep_big: false };
    assert.true(content_failure('m', { fakeXHR: { status: 0 } }, item).passing);
    assert.true(content_failure('m', { offline: true }, item).passing);
    assert.false(content_failure('m', { fakeXHR: { status: 400 } }, item).passing);
    assert.false(content_failure('m', undefined, item).passing);
    assert.deepEqual(content_failure('m', null, item).item, { message: 'm', url: 'http://example.com/a.png', type: 'image', keep_big: false });
  });

  test('every save settles before the board is judged; the first failure in time is the one reported', async function(assert) {
    var failures = [];
    var slow = RSVP.defer();
    var settled = false;
    var p = settle_content([RSVP.reject({ error: 'first' }), slow.promise, RSVP.reject({ error: 'second' })], failures);
    p.then(null, function() { settled = true; });
    await new RSVP.Promise(function(r) { setTimeout(r, 10); });
    assert.false(settled, 'still waiting for the save in progress');
    slow.resolve();
    var err = null;
    try { await p; } catch(e) { err = e; }
    assert.strictEqual(err.error, 'first');
    assert.deepEqual(failures.map(function(f) { return f.error; }), ['first', 'second']);
  });

  test('settle_content resolves when every save succeeds, and at once with none', async function(assert) {
    var failures = [];
    await settle_content([RSVP.resolve(1), RSVP.resolve(2)], failures);
    await settle_content([], failures);
    assert.deepEqual(failures, []);
  });

  test('a retry only when every failure passes, up to MAX_BOARD_RETRIES, counted apart from lookup retries', function(assert) {
    var item = { url: 'u', type: 'image' };
    var passing = content_failure('m', { fakeXHR: { status: 0 } }, item);
    var real = content_failure('m', { fakeXHR: { status: 400 } }, item);
    var progress = {};
    assert.strictEqual(claim_content_retry([passing, real], progress, '145'), 0, 'a picture that does not exist: reported now');
    assert.strictEqual(claim_content_retry([passing, { error: 'not a content failure' }], progress, '145'), 0);
    assert.strictEqual(claim_content_retry([], progress, '145'), 0);
    var claims = [];
    for(var n = 0; n <= MAX_BOARD_RETRIES; n++) { claims.push(claim_content_retry([passing], progress, '145')); }
    assert.deepEqual(claims, [1, 2, 3, 0], 'three more tries, then the retries are spent');
    assert.strictEqual(MAX_BOARD_RETRIES, 3);
    var both = {};
    claim_board_retry(both, '145', { error: 'timeout' });
    claim_board_retry(both, '145', { error: 'timeout' });
    claim_board_retry(both, '145', { error: 'timeout' });
    assert.strictEqual(claim_content_retry([passing], both, '145'), 1, 'lookup retries do not use up content retries');
  });

  test('the parked entry keeps the board\'s place and only the failed saves', function(assert) {
    var next = { id: '145', key: 'fred/home', depth: 0, visit_source: 'home board' };
    var entry = content_entry(next, [content_failure('m', null, { url: 'u', type: 'image', keep_big: true })], { id: '1_145', full_set_revision: 'r1' });
    assert.deepEqual(entry, { id: '145', key: 'fred/home', depth: 0, visit_source: 'home board', content_retry: [{ message: 'm', url: 'u', type: 'image', keep_big: true }], content_board: { id: '1_145', full_set_revision: 'r1' } });
    assert.strictEqual(next.content_retry, undefined, 'the walk\'s own entry is not changed');
  });

  test('the board error is worded as the walk words it', function(assert) {
    assert.deepEqual(content_error({ id: '145', key: 'fred/home', visit_source: 'home board' }, { error: 'button image failed to sync, u' }),
      { error: 'board fred/home failed to sync completely: button image failed to sync, u, linked from home board', board_id: '145', board_key: 'fred/home' });
    assert.strictEqual(content_error({ id: '145' }, 'oops').error, 'board 145 failed to sync completely: oops');
    assert.deepEqual(content_error({ key: 'fred/liked', visit_source: 'starred board' }, { error: 'e' }),
      { error: 'board fred/liked failed to sync completely: e, linked from starred board', board_id: 'fred/liked', board_key: 'fred/liked' }, 'a board known by key only, as the walk records it');
  });

  function ctx_for(answers) {
    var log = { stored: [], parked: [], failed: [], saved: [], then: 0 };
    var ctx = {
      sync_progress: {},
      store: function(item) { log.stored.push(item.url); return answers[item.url](); },
      saved: function(board) { log.saved.push(board); },
      park: function(entry, retry) { log.parked.push({ entry: entry, retry: retry }); },
      fail: function(err) { log.failed.push(err); },
      then: function() { log.then++; }
    };
    return { ctx: ctx, log: log };
  }
  var entry = { id: '145', key: 'fred/home', visit_source: 'home board', content_board: { id: '1_145', full_set_revision: 'r1' }, content_retry: [
    { url: 'a', type: 'image', keep_big: false, message: 'button image failed to sync, a' },
    { url: 'b', type: 'sound', keep_big: false, message: 'button sound failed to sync, b' }
  ] };

  test('a retry saves only the parked content, and the walk goes on', async function(assert) {
    var r = ctx_for({ a: function() { return RSVP.resolve({}); }, b: function() { return RSVP.resolve({}); } });
    await retry_content(entry, r.ctx);
    assert.deepEqual(r.log.stored, ['a', 'b']);
    assert.deepEqual(r.log.parked, []);
    assert.deepEqual(r.log.failed, []);
    assert.deepEqual(r.log.saved, [{ id: '1_145', full_set_revision: 'r1' }], 'the board is recorded as complete, as the walk does for a board that saved');
    assert.strictEqual(r.log.then, 1);
  });

  test('a save that throws is a failure of that save, and the walk still goes on once', async function(assert) {
    var r = ctx_for({ a: function() { throw new Error('boom'); }, b: function() { return RSVP.resolve({}); } });
    await retry_content(entry, r.ctx);
    assert.strictEqual(r.log.failed.length, 1);
    assert.strictEqual(r.log.failed[0].error, 'board fred/home failed to sync completely: button image failed to sync, a, linked from home board');
    assert.deepEqual(r.log.saved, []);
    assert.strictEqual(r.log.then, 1);
  });

  test('a save that fails again for a passing reason is parked again with only what failed', async function(assert) {
    var r = ctx_for({ a: function() { return RSVP.resolve({}); }, b: function() { return RSVP.reject({ fakeXHR: { status: 0 } }); } });
    await retry_content(entry, r.ctx);
    assert.strictEqual(r.log.parked.length, 1);
    assert.strictEqual(r.log.parked[0].retry, 1);
    assert.deepEqual(r.log.parked[0].entry.content_retry.map(function(i) { return i.url; }), ['b']);
    assert.deepEqual(r.log.parked[0].entry.content_board, { id: '1_145', full_set_revision: 'r1' }, 'kept for the next retry');
    assert.deepEqual(r.log.saved, []);
    assert.deepEqual(r.log.failed, []);
    assert.strictEqual(r.log.then, 1);
  });

  test('a save that fails for a reason that does not pass reports the board', async function(assert) {
    var r = ctx_for({ a: function() { return RSVP.reject({ fakeXHR: { status: 400 } }); }, b: function() { return RSVP.resolve({}); } });
    await retry_content(entry, r.ctx);
    assert.deepEqual(r.log.parked, []);
    assert.deepEqual(r.log.failed, [{ error: 'board fred/home failed to sync completely: button image failed to sync, a, linked from home board', board_id: '145', board_key: 'fred/home' }]);
    assert.strictEqual(r.log.then, 1);
  });
});
