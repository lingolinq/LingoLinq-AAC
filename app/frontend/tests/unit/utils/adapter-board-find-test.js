import { module, test } from 'qunit';
import RSVP from 'rsvp';
import $ from 'jquery';
import { settled, waitUntil } from '@ember/test-helpers';
import { setupTest } from 'frontend/tests/helpers';
import { queryLog } from 'frontend/tests/helpers/ember_helper';
import { stub, restoreStubs } from 'frontend/tests/helpers/jasmine';
import { stubOnPersistence } from 'frontend/tests/helpers/persistence-stub';
import persistence from 'frontend/utils/persistence';
import { find_limits } from 'frontend/utils/board_download';
import * as boardDownload from 'frontend/utils/board_download';

/* BOARD DOWNLOADS THROUGH THE ADAPTER (Android sync fix, 2026-11-14;
 * docs/task-management/2026-11-14_android-sync-slow-problems.md, "Final plan").
 *
 * A board can be 1 to 2 MB. On a phone link shared with the sync, the transport's 8 s first try was cut off and
 * restarted, the adapter answered "timeout" at 15 s, and the answer that then arrived was thrown away (9 of 9
 * failed boards on a real device were 0.92 to 2.02 MB). These tests run the real DSExtend findRecord
 * (utils/persistence.js) through the real adapter and the app's $.ajax wrapper (utils/extras.js); only the network
 * ($.realAjax) and the device database calls of the instance the adapter reads are replaced. In utils/persistence.js
 * the bare name `persistence` is that module's own instance, not the service, so a stub on the service alone would
 * never be reached: stubOnPersistence covers both. The adapter's caller limit is scaled, never waited for. */
module('Unit | Utility | adapter board find', function(hooks) {
  setupTest(hooks);

  var BOARD_URL = /\/api\/v1\/boards\//;

  function board_payload(id, extra) {
    return {
      board: Object.assign({ id: id, key: 'fetcher/board-' + id, name: 'Board ' + id, buttons: [],
        grid: { rows: 1, columns: 1, order: [[null]] }, updated: '2026-11-14T10:00:00Z' }, extra || {}),
      images: [{ id: '1_img', url: 'https://example.com/pic.png' }],
      sounds: []
    };
  }

  // The transport's timeout as the app's $.ajax wrapper sees it from jQuery: (jqXHR, 'timeout', 'timeout').
  function timed_out() {
    return $.Deferred().reject({ status: 0, readyState: 0 }, 'timeout', 'timeout').promise();
  }

  function stub_database(ctx) {
    stubOnPersistence('find', function(store, id) {
      var row = ctx.rows[id];
      return row ? RSVP.resolve({ board: row }) : RSVP.reject({ error: 'record not found' });
    });
    stubOnPersistence('store_eventually', function(store, obj) {
      ctx.stored.push({ store: store, obj: JSON.parse(JSON.stringify(obj)) });
      return RSVP.resolve(obj);
    });
  }

  function stored_boards(ctx) {
    return ctx.stored.filter(function(s) { return s.store === 'board'; });
  }

  hooks.beforeEach(function() {
    this.store = this.owner.lookup('service:store');
    this.service = this.owner.lookup('service:persistence');
    this.prior = { real_lookup: queryLog.real_lookup, online: this.service.get('online'), caller_ms: find_limits.caller_ms,
      force_reload: persistence.force_reload };
    queryLog.real_lookup = true; // the test adapter (tests/helpers/ember_helper.js) passes finds to the real one
    if(this.service.stashes) { this.service.stashes._was_online = undefined; } // not a reconnect (see preference-save-test.js)
    this.service.set('online', true);
    find_limits.caller_ms = 30;
    this.rows = {}; // the device database, by board id
    this.stored = [];
    stub_database(this);
    this.pending = [];
  });

  hooks.afterEach(async function() {
    this.pending.forEach(function(d) { if(d.state() === 'pending') { d.reject({ status: 0, readyState: 0 }, 'abort', ''); } });
    await settled();
    restoreStubs();
    find_limits.caller_ms = this.prior.caller_ms;
    persistence.force_reload = this.prior.force_reload;
    queryLog.real_lookup = this.prior.real_lookup;
    if(this.service.stashes) { this.service.stashes._was_online = undefined; }
    this.service.set('online', this.prior.online);
  });

  // A download that answers only when the test says so.
  function held(ctx) {
    var d = $.Deferred();
    ctx.pending.push(d);
    return d;
  }

  async function outcome(promise) {
    var res = { done: false, error: {}, value: null };
    promise.then(function(r) { res.done = true; res.value = r; }, function(e) { res.done = true; res.error = e || {}; });
    await settled();
    return res;
  }

  function record_calls(calls) {
    stub($, 'realAjax', function(options) {
      calls.push({ url: options.url, timeout: options.timeout });
      return timed_out();
    });
  }

  test('a board is downloaded in one long attempt', async function(assert) {
    var calls = [];
    record_calls(calls);
    await outcome(this.store.findRecord('board', '1_901'));
    var board_calls = calls.filter(function(c) { return BOARD_URL.test(c.url); });
    var board_timeout = (board_calls[0] || {}).timeout;
    assert.strictEqual(board_calls.length, 1, 'the board is asked for once: no retry restarts it from zero');
    assert.strictEqual(board_timeout, 60000, 'with the long limit');
  });

  test('a user is still fetched with the usual limit and retries', async function(assert) {
    var calls = [];
    record_calls(calls);
    await outcome(this.store.findRecord('user', '1_902'));
    var user_calls = calls.filter(function(c) { return /\/api\/v1\/users\//.test(c.url); });
    var user_timeout = (user_calls[0] || {}).timeout;
    assert.strictEqual(user_calls.length, 3, 'a user find keeps the wrapper retries');
    assert.strictEqual(user_timeout, 8000, 'and the 8 s first try');
  });

  test('a board that answers after the caller limit is stored, and the caller was told "timeout"', async function(assert) {
    var d = held(this);
    stub($, 'realAjax', function(options) { return BOARD_URL.test(options.url) ? d.promise() : timed_out(); });
    var res = await outcome(this.store.findRecord('board', '1_903'));
    assert.strictEqual(res.error.error, 'timeout', 'the caller is answered at the caller limit');
    d.resolve(board_payload('1_903'));
    await settled();
    var boards = stored_boards(this);
    assert.strictEqual(boards.length, 1, 'the late answer is stored on the device');
    var obj = (boards[0] || {}).obj || {};
    var board = obj.board || {};
    assert.strictEqual(board.id, '1_903');
    assert.strictEqual(typeof board.retrieved, 'number', 'stamped as fetched, so the sync can trust it');
    assert.false('images' in obj, 'without the pictures list (the serializer strips it from answers in time)');
  });

  test('a late answer never replaces a newer or changed copy on the device', async function(assert) {
    var cases = [
      ['an offline edit waiting to be sent', { changed: true }],
      ['a board marked revoked', { revoked: true }],
      ['a copy saved later than this answer', { updated: '2026-11-14T11:00:00Z' }]
    ];
    assert.expect(cases.length * 2);
    for(var idx = 0; idx < cases.length; idx++) {
      var id = '1_91' + idx;
      this.rows[id] = Object.assign({ id: id, key: 'fetcher/board-' + id, updated: '2026-11-14T10:00:00Z' }, cases[idx][1]);
      this.stored.length = 0;
      var d = held(this);
      stub($, 'realAjax', function(options) { return BOARD_URL.test(options.url) ? d.promise() : timed_out(); });
      persistence.force_reload = 'board_' + id; // a refresh, so the device copy is not simply returned
      var res = await outcome(this.store.findRecord('board', id));
      assert.strictEqual(res.error.error, 'timeout', cases[idx][0] + ': the caller is told "timeout"');
      d.resolve(board_payload(id));
      await settled();
      assert.strictEqual(stored_boards(this).length, 0, cases[idx][0] + ': not overwritten');
      restoreStubs();
      stub_database(this);
    }
  });

  test('a second request for a board that is still downloading joins that download', async function(assert) {
    find_limits.caller_ms = 300; // room for the second caller to be answered by the download it joined
    var d = held(this);
    var board_calls = 0;
    stub($, 'realAjax', function(options) {
      if(BOARD_URL.test(options.url)) { board_calls++; return d.promise(); }
      return timed_out();
    });
    var first = await outcome(this.store.findRecord('board', '1_904'));
    assert.strictEqual(first.error.error, 'timeout', 'the first caller is answered at the caller limit');
    var second = { done: false, value: null };
    this.store.findRecord('board', '1_904').then(function(r) { second.done = true; second.value = r; }, function(e) { second.done = true; second.error = e; });
    // Either a second download starts, or the second request is waiting on the first one.
    await waitUntil(function() { return board_calls >= 2 || (boardDownload.waiting_on && boardDownload.waiting_on('board_1_904') === 2); });
    assert.strictEqual(board_calls, 1, 'no second download of the same board');
    d.resolve(board_payload('1_904'));
    await settled();
    var second_id = second.value ? second.value.get('id') : null;
    assert.strictEqual(second_id, '1_904', 'the second caller gets the download it joined');
  });

  /* The guard for the High finding of both review rounds: a refresh of a board that has a copy on the device, whose
     download fails after the caller limit, must REJECT. If the transport answered first, its status-0 failure would
     take the device fallback and resolve with the OLD copy, reported as re-downloaded. Green on today's code (its
     15 s timer also answers first); it fails if the caller limit is ever set above the transport's. */
  test('a refresh whose download fails after the caller limit is a "timeout", never the old copy', async function(assert) {
    this.rows['1_905'] = board_payload('1_905', { name: 'OLD', updated: '2026-11-13T10:00:00Z' }).board; // a whole board, so it loads if returned
    var d = held(this);
    stub($, 'realAjax', function(options) { return BOARD_URL.test(options.url) ? d.promise() : timed_out(); });
    persistence.force_reload = 'board_1_905';
    var res = { done: false, error: {}, value: null };
    this.store.findRecord('board', '1_905').then(function(r) { res.done = true; res.value = r; }, function(e) { res.done = true; res.error = e || {}; });
    // The caller limit (30 ms here) answers first. Not settled(): Ember Data's waiter holds it while the request is
    // open, so a build without the caller limit would only time out; this lets it answer from the transport instead.
    await waitUntil(function() { return res.done; }, { timeout: 500 }).catch(function() { });
    d.reject({ status: 0, readyState: 0 }, 'timeout', 'timeout');
    await settled();
    assert.true(res.done, 'answered');
    assert.strictEqual(res.value, null, 'not resolved with the device copy');
    assert.strictEqual(res.error.error, 'timeout');
  });
});
