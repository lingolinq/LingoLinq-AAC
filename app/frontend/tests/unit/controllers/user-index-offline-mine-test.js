import { module, test } from 'qunit';
import { setupTest } from 'frontend/tests/helpers';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import boardsPageListCache from 'frontend/utils/boards_page_list_cache';

/* Offline, the boards page swaps its tabs and list for "Boards on This Device" (controllers/user/index.js
 * show_device_boards; docs/task-management/2026-11-16_offline-boards-page.md). Reported on Android: sync, airplane
 * mode, My Boards said "You don't have any boards yet". The device owner and the device's boards are set on each
 * test's own controller (device_db_user, device_storage), not on shared singletons. */
module('Unit | Controller | user/index offline boards view', function(hooks) {
  setupTest(hooks);

  hooks.afterEach(function() {
    boardsPageListCache.clear('9911_9');
    boardsPageListCache.setBoardsPageActive(false);
  });

  function rows() {
    return [
      { data: { id: '9911_1', raw: { id: '9911_1', key: 'larry/home', name: 'Home', user_name: 'larry' } } },
      { data: { id: '9911_2', raw: { id: '9911_2', key: 'other/y', name: 'Other', user_name: 'other' } } },
    ];
  }
  function page(owner, opts) {
    opts = opts || {};
    // What routes/user/boards.js activate sets before its setupController runs update_selected.
    boardsPageListCache.setBoardsPageActive(!opts.other_page);
    var c = owner.lookup('controller:user/index');
    c.reads = 0;
    c.device_db_user = function() { return opts.db_user === undefined ? 'larry' : opts.db_user; };
    c.set('device_storage', { find_all: opts.find_all || function() { c.reads++; return RSVP.resolve(rows()); } });
    c.set('persistence', EmberObject.create({ online: !!opts.online, sync_log: [], meta: function() { return null; } }));
    c.set('store', owner.lookup('service:store'));
    c.set('model', EmberObject.create({ id: '9911_9', user_name: opts.user_name || 'larry', permissions: opts.permissions || { supervise: true, model: true },
      preferences: (opts.user_name || 'larry') === 'larry' ? { home_board: { id: '9911_1', key: 'larry/home' } } : {}, stats: {} })); // each person's own seeds
    return c;
  }
  var tick = function() { return new Promise((r) => setTimeout(r, 30)); };
  var keys = function(list) { return list.map((b) => b.get('key')); };

  test('opened offline: the view is on, and lists the boards on the device', async function(assert) {
    var c = page(this.owner);
    c.update_selected();
    await tick();
    assert.true(c.get('offline_view'));
    assert.deepEqual(keys(c.get('offline_boards')), ['larry/home']);
    assert.notOk(c.get('model.my_boards'), 'the Mine list is never touched');
  });

  test('whatever tab or list was on screen, the device list is read (not the list on screen)', async function(assert) {
    var c = page(this.owner);
    var shown = [];
    shown.done = true;
    c.set('model.my_boards', shown);
    c.set('selected', 'public');
    c.update_selected();
    await tick();
    assert.true(c.get('offline_view'));
    assert.deepEqual(keys(c.get('offline_boards')), ['larry/home']);
    assert.strictEqual(c.get('model.my_boards'), shown, 'the server list stays as it was, for when the connection returns');
  });

  // The identity guard, one clause at a time.
  test('your own page, but the open database is not yours (or unknown): never read, no view', async function(assert) {
    var c = page(this.owner, { db_user: null });
    c.update_selected();
    await tick();
    assert.strictEqual(c.reads, 0);
    assert.false(c.get('offline_view'));
  });

  test('another person\'s page you may not model for: your database is not read for them', async function(assert) {
    var c = page(this.owner, { user_name: 'sam', permissions: { supervise: true } });
    c.update_selected();
    await tick();
    assert.strictEqual(c.reads, 0);
  });

  test('a communicator\'s page you may model for: their boards on your device are listed', async function(assert) {
    var c = page(this.owner, { user_name: 'other', permissions: { supervise: true, model: true } });
    c.update_selected();
    await tick();
    assert.deepEqual(keys(c.get('offline_boards')), ['other/y']);
  });

  test('a connection drop on another page reads nothing', async function(assert) {
    var c = page(this.owner, { other_page: true });
    c.update_selected();
    await tick();
    assert.strictEqual(c.reads, 0);
    assert.false(c.get('offline_view'));
  });

  test('coming back to the page offline keeps the list, without reading the database again', async function(assert) {
    var c = page(this.owner);
    c.update_selected();
    await tick();
    var first = c.get('offline_boards');
    c.update_selected();
    await tick();
    assert.strictEqual(c.get('offline_boards'), first);
    assert.strictEqual(c.reads, 1);
  });

  test('a device read that ends after a newer request is dropped', async function(assert) {
    var release = null;
    var c = page(this.owner, { find_all: function() { return new RSVP.Promise((r) => { release = r; }); } });
    c.update_selected();
    await tick(); // the read starts inside the promise chain (utils/offline_board_list.js)
    assert.strictEqual(typeof release, 'function', 'the device was read');
    c.set('list_id', 'newer'); // back online: update_selected started a newer list
    release(rows());
    await tick();
    assert.notOk(c.get('offline_boards.from_device'));
  });

  test('back online, the view ends only when a server list arrives', async function(assert) {
    var c = page(this.owner);
    c.update_selected();
    await tick();
    assert.true(c.get('offline_view'));
    var answer = RSVP.defer();
    c.set('store', { query: function() { return answer.promise; }, peekRecord: function() { return null; } });
    c.set('persistence.online', true);
    c.set('selected', 'mine'); // update_selected runs (the observer)
    await tick();
    assert.true(c.get('offline_view'), 'still the device list while the server has not answered (no flipping)');
    answer.resolve([]);
    await tick();
    assert.false(c.get('offline_view'));
  });
});
