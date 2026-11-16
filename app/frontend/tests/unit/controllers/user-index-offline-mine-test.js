import { module, test } from 'qunit';
import { setupTest } from 'frontend/tests/helpers';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import boardsPageListCache from 'frontend/utils/boards_page_list_cache';

/* Offline, the boards page's Mine list is the boards saved on this device (controllers/user/index.js
 * show_device_boards; docs/task-management/2026-11-16_offline-boards-page.md). Reported on Android: sync, airplane
 * mode, My Boards said "You don't have any boards yet". The device owner and the device's boards are set on each
 * test's own controller (device_db_user, device_storage), not on shared singletons. */
module('Unit | Controller | user/index offline Mine list', function(hooks) {
  setupTest(hooks);

  hooks.afterEach(function() {
    boardsPageListCache.clear('9911_9');
    boardsPageListCache.setBoardsPageActive(false);
  });

  function rows() {
    return [
      { data: { id: '9911_1', raw: { id: '9911_1', key: 'larry/home', name: 'Home' } } },
      { data: { id: '9911_2', raw: { id: '9911_2', key: 'other/y', name: 'Not mine' } } },
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
    c.set('persistence', EmberObject.create({ online: !!opts.online, meta: function() { return null; } }));
    c.set('store', owner.lookup('service:store'));
    c.set('model', EmberObject.create({ id: '9911_9', user_name: opts.user_name || 'larry', permissions: opts.permissions || { supervise: true, model: true } }));
    return c;
  }
  var tick = function() { return new Promise((r) => setTimeout(r, 30)); };

  test('opened offline (no tab chosen yet): the boards saved on the device are listed', async function(assert) {
    var c = page(this.owner);
    c.update_selected();
    await tick();
    var list = c.get('model.my_boards');
    assert.deepEqual(list.map((b) => b.get('key')), ['larry/home'], 'own boards only');
    assert.true(list.done);
  });

  // The identity guard, one clause at a time: the open database must be the signed-in person's, and the page must be
  // theirs or one they may model for.
  test('your own page, but the open database is not yours (or unknown): never read', async function(assert) {
    var c = page(this.owner, { db_user: null });
    c.update_selected();
    await tick();
    assert.strictEqual(c.reads, 0);
    assert.notOk(c.get('model.my_boards'));
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
    assert.deepEqual(c.get('model.my_boards').map((b) => b.get('key')), ['other/y']);
  });

  test('coming back to the page offline keeps the device list, without reading the database again', async function(assert) {
    var c = page(this.owner);
    c.update_selected();
    await tick();
    var first = c.get('model.my_boards');
    c.update_selected();
    await tick();
    assert.strictEqual(c.get('model.my_boards'), first);
    assert.strictEqual(c.reads, 1);
  });

  test('a connection drop on another page reads nothing', async function(assert) {
    var c = page(this.owner, { other_page: true });
    c.update_selected();
    await tick();
    assert.strictEqual(c.reads, 0);
  });

  test('a finished list already on screen stays through a drop', async function(assert) {
    var c = page(this.owner);
    var shown = [];
    shown.done = true;
    c.set('model.my_boards', shown);
    c.update_selected();
    await tick();
    assert.strictEqual(c.get('model.my_boards'), shown);
    assert.strictEqual(c.reads, 0);
  });

  test('a device read that ends after a newer request is dropped', async function(assert) {
    var release = null;
    var c = page(this.owner, { find_all: function() { return new RSVP.Promise((r) => { release = r; }); } });
    c.update_selected();
    assert.strictEqual(typeof release, 'function', 'the device was read');
    c.set('list_id', 'newer'); // back online: update_selected started a newer list
    release(rows());
    await tick();
    assert.notOk(c.get('model.my_boards.from_device'));
  });

  test('back online, the device list is replaced by the server list, even with a fresh snapshot', async function(assert) {
    var c = page(this.owner, { online: true });
    var queried = 0;
    c.set('store', { query: function() { queried++; return RSVP.resolve([]); }, peekRecord: function() { return null; } });
    var device = [];
    device.done = true;
    device.from_device = true;
    c.set('model.my_boards', device);
    boardsPageListCache.write('9911_9', []);
    c.set('selected', 'mine'); // fires update_selected itself (the observer)
    await tick();
    assert.strictEqual(queried, 1, 'the server list was asked for');
  });
});
