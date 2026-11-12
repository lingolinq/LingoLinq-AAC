import { module, test } from 'qunit';
import RSVP from 'rsvp';
import { settled } from '@ember/test-helpers';
import PersistenceService from 'frontend/services/persistence';
import { stub, restoreStubs } from 'frontend/tests/helpers/jasmine';

/* THE SERVICE'S DOWNLOAD QUEUE AFTER A CANCEL (section 22 of docs/task-management/2026-11-10_offline-followup-proposals.md).
 * store_url keeps its queue and workers on the service CLASS (urls_to_store, storing_urls, storing_url_watchers);
 * test cleanup resets only the instance, so this module saves and restores those statics itself. A fake instance
 * stands in as window.persistence (store_url reads sync_progress and downloads through it). */
var STATICS = ['urls_to_store', 'storing_urls', 'storing_url_watchers'];

module('Unit | Service | persistence store_url queue after a cancel', function(hooks) {
  var saved = null;
  var fake = null;
  hooks.beforeEach(function() {
    saved = {};
    STATICS.forEach(function(k) { saved[k] = Object.getOwnPropertyDescriptor(PersistenceService, k); delete PersistenceService[k]; });
    fake = {
      sp: null,
      downloads: [],
      get: function(key) {
        if(key === 'sync_progress') { return this.sp; }
        if(key === 'sync_progress.canceled') { return this.sp && this.sp.canceled; }
        if(key === 'sync_progress.sync_id') { return this.sp && this.sp.sync_id; }
        return undefined;
      },
      store_url_now: function(url) { var d = RSVP.defer(); this.downloads.push({ url: url, defer: d }); return d.promise; }
    };
    stub(window, 'persistence', fake);
  });
  hooks.afterEach(function() {
    restoreStubs();
    STATICS.forEach(function(k) { delete PersistenceService[k]; if(saved[k]) { Object.defineProperty(PersistenceService, k, saved[k]); } });
  });

  function store(url, sync_id) {
    var state = { done: false };
    PersistenceService.proto().store_url.call(fake, url, 'image', false, false, sync_id).then(function() { state.done = true; }, function() { state.done = true; });
    return state;
  }
  function finish_downloads() { fake.downloads.forEach(function(d) { if(!d.finished) { d.finished = true; d.defer.resolve({}); } }); }
  function downloaded() { return fake.downloads.map(function(d) { return d.url; }); }

  test('after a cancel, the queue keeps going: the cancelled sync\'s items settle and later downloads run', async function(assert) {
    fake.sp = { sync_id: 'A' };
    var busy = [store('b1'), store('b2'), store('b3')];
    var tagged = [store('a1', 'A'), store('a2', 'A'), store('a3', 'A'), store('a4', 'A'), store('a5', 'A')];
    var later = store('u1');
    fake.sp.canceled = true;
    finish_downloads();
    await settled();
    assert.true(busy.every(function(s) { return s.done; }), 'the downloads in flight finished');
    assert.true(tagged.every(function(s) { return s.done; }), 'every item of the cancelled sync settled');
    assert.notOk(downloaded().some(function(u) { return /^a/.test(u); }), 'none of them was downloaded');
    assert.notStrictEqual(downloaded().indexOf('u1'), -1, 'the untagged item behind them was downloaded');
    finish_downloads();
    await settled();
    assert.true(later.done);
    var after = store('v1');
    assert.notStrictEqual(downloaded().indexOf('v1'), -1, 'a download asked for afterwards starts');
    finish_downloads();
    await settled();
    assert.true(after.done);
    assert.strictEqual(PersistenceService.storing_url_watchers, 0, 'every worker ended');
  });

  test('ten thousand items of a cancelled sync drain, and the workers end', async function(assert) {
    fake.sp = { sync_id: 'A' };
    store('b1'); store('b2'); store('b3');
    var tagged = [];
    for(var i = 0; i < 10000; i++) { tagged.push(store('a' + i, 'A')); }
    fake.sp.canceled = true;
    finish_downloads();
    await settled();
    assert.true(tagged.every(function(s) { return s.done; }), 'all settled');
    assert.strictEqual(PersistenceService.urls_to_store.length, 0);
    assert.strictEqual(PersistenceService.storing_url_watchers, 0);
  });

  test('an item of an older sync is not downloaded under the next one', async function(assert) {
    fake.sp = { sync_id: 'A' };
    store('b1'); store('b2'); store('b3');
    var old_item = store('old', 'A');
    fake.sp = { sync_id: 'B' };
    var new_item = store('new', 'B');
    finish_downloads();
    await settled();
    assert.true(old_item.done, 'the old item settled');
    assert.strictEqual(downloaded().indexOf('old'), -1, 'without downloading');
    assert.notStrictEqual(downloaded().indexOf('new'), -1, 'the new sync\'s item downloads');
    finish_downloads();
    await settled();
    assert.true(new_item.done);
  });
});
