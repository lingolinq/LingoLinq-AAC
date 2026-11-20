import { module, test } from 'qunit';
import { setupTest } from 'frontend/tests/helpers';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import boardsPageListCache from 'frontend/utils/boards_page_list_cache';
import capabilities from 'frontend/utils/capabilities';
import { stub, restoreStubs } from 'frontend/tests/helpers/jasmine';

/* Offline, the boards page swaps its tabs and list for "Boards on This Device" (controllers/user/index.js
 * show_device_boards; docs/task-management/2026-11-16_offline-boards-page.md). Reported on Android: sync, airplane
 * mode, My Boards said "You don't have any boards yet". The device owner and the device's boards are set on each
 * test's own controller (device_db_user, device_storage), not on shared singletons. */
module('Unit | Controller | user/index offline boards view', function(hooks) {
  setupTest(hooks);

  hooks.afterEach(function() {
    boardsPageListCache.clear('9911_9');
    boardsPageListCache.setBoardsPageActive(false);
    // A test whose server list never answers (pending_store) leaves the Mine list busy; board_detail_cache's prefetch
    // waits on that flag for up to 2 minutes, which timed out the next modules' tests in CI.
    boardsPageListCache.setMineListBusy(false);
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
    if(opts.db_user !== 'real') { c.device_db_user = function() { return opts.db_user === undefined ? 'larry' : opts.db_user; }; }
    c.set('device_storage', { find_all: opts.find_all || function() { c.reads++; return RSVP.resolve(rows()); } });
    c.set('persistence', EmberObject.create({ online: !!opts.online, sync_log: [], meta: function() { return null; } }));
    c.set('store', owner.lookup('service:store'));
    // A trusted device unless the test says otherwise (Part 3: on a shared device only what opens there is listed).
    var trust = opts.trust === undefined ? true : opts.trust;
    c.set('appState', EmberObject.create({ sessionUser: trust === null ? null : EmberObject.create({ preferences: { device: { long_token: trust } } }) }));
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

  // Part 3 (docs/task-management/2026-11-16_offline-boards-page.md): the list belongs to one offline spell. Back online
  // it stays on screen until the server list arrives; the next time the page goes offline the device is read again (a
  // sync, a like or an unshare may have changed it), with the earlier list on screen until the new one is ready.
  function pending_store(owner) {
    var real = owner.lookup('service:store');
    return { query: function() { return new RSVP.Promise(function() {}); }, peekRecord: real.peekRecord.bind(real), push: real.push.bind(real) };
  }

  test('a new offline spell reads the device again; the earlier list stays on screen meanwhile', async function(assert) {
    var second = null;
    var c = page(this.owner, { find_all: function() { c.reads++; return c.reads === 1 ? RSVP.resolve(rows()) : new RSVP.Promise((r) => { second = r; }); } });
    c.update_selected();
    await tick();
    var first = c.get('offline_boards');
    assert.deepEqual(keys(first), ['larry/home']);
    c.set('store', pending_store(this.owner));
    c.set('persistence.online', true);
    await tick();
    assert.strictEqual(c.get('offline_boards'), first, 'online, the server list not here yet: unchanged');
    c.set('persistence.online', false);
    await tick();
    assert.strictEqual(c.reads, 2, 'read again in the new offline spell');
    assert.strictEqual(c.get('offline_boards'), first, 'the earlier list stays on screen during the read');
    second(rows().concat([{ data: { id: '9911_3', raw: { id: '9911_3', key: 'larry/new', name: 'New', user_name: 'larry' } } }]));
    await tick();
    assert.deepEqual(keys(c.get('offline_boards')), ['larry/home', 'larry/new']);
  });

  test('a re-read that fails keeps the earlier list', async function(assert) {
    var c = page(this.owner, { find_all: function() { c.reads++; if(c.reads > 1) { throw new Error('The database connection is closing.'); } return RSVP.resolve(rows()); } });
    c.update_selected();
    await tick();
    var first = c.get('offline_boards');
    c.set('store', pending_store(this.owner));
    c.set('persistence.online', true);
    await tick();
    c.set('persistence.online', false);
    await tick();
    assert.strictEqual(c.reads, 2);
    assert.strictEqual(c.get('offline_boards'), first, 'not swapped for an empty list');
  });

  test('a shared device, or one whose trust is not known yet: a communicator\'s boards are not listed (they do not open there)', async function(assert) {
    var c = page(this.owner, { user_name: 'other', permissions: { supervise: true, model: true }, trust: null });
    c.update_selected();
    await tick();
    assert.deepEqual(keys(c.get('offline_boards')), []);
  });

  test('the device becoming trusted reads the list again', async function(assert) {
    var c = page(this.owner, { trust: false });
    c.update_selected();
    await tick();
    assert.strictEqual(c.reads, 1);
    c.set('appState.sessionUser', EmberObject.create({ preferences: { device: { long_token: true } } }));
    c.update_selected();
    await tick();
    assert.strictEqual(c.reads, 2);
  });

  // The real owner check (utils/offline_board_list.js current_device_db_user), not a test stand-in: the open database's
  // name (capabilities.db_name, set at app start) must name the signed-in person (the auth_settings stash).
  test('the real owner check: read only when the open database is the signed-in person\'s', async function(assert) {
    assert.expect(4);
    try {
      // utils/_stashes exports a Proxy that reads window.stashes (the service instance, or the class when there is
      // none) and has no set trap, so the stub goes on window.stashes itself.
      stub(window.stashes, 'get_object', function(key) { return key === 'auth_settings' ? { user_name: 'larry' } : null; });
      stub(capabilities, 'db_name', 'lingolinqStorage::larry===abc');
      var c = page(this.owner, { db_user: 'real' });
      c.update_selected();
      await tick();
      assert.strictEqual(c.reads, 1, 'larry\'s database, larry signed in');
      assert.deepEqual(keys(c.get('offline_boards')), ['larry/home']);
      c.set('offline_boards', null);
      c.set('offline_view', false);
      stub(capabilities, 'db_name', 'lingolinqStorage::sam===abc');
      c.update_selected();
      await tick();
      assert.strictEqual(c.reads, 1, 'sam\'s database still open after larry signed in: not read');
      assert.false(c.get('offline_view'));
    } finally {
      restoreStubs();
    }
  });

  // Final review (2026-11-17): a first read that fails is not kept for the whole offline spell; the next call reads again.
  test('a first read that fails is shown as failed and read again next time', async function(assert) {
    var c = page(this.owner, { find_all: function() { c.reads++; if(c.reads === 1) { throw new Error('The database connection is closing.'); } return RSVP.resolve(rows()); } });
    c.update_selected();
    await tick();
    assert.true(c.get('offline_boards.read_failed'), 'marked as a failed read, not an empty device');
    c.update_selected();
    await tick();
    assert.strictEqual(c.reads, 2, 'read again');
    assert.deepEqual(keys(c.get('offline_boards')), ['larry/home']);
  });

  // Review round 3, M1: the controller is shared across boards pages and the route does not reset it
  // (routes/user/boards.js setupController). A page whose device list is refused must not keep the previous page's.
  test('moving offline to a page whose list is refused does not keep the previous page\'s list', async function(assert) {
    var c = page(this.owner);
    c.update_selected();
    await tick();
    assert.deepEqual(keys(c.get('offline_boards')), ['larry/home'], 'larry\'s own page: his list');
    // What the route's setupController does on the next page: a new model, then update_selected.
    c.set('model', EmberObject.create({ id: '9911_8', user_name: 'sam', permissions: { supervise: true }, preferences: {}, stats: {} }));
    c.update_selected();
    await tick();
    assert.false(c.get('offline_view'), 'not the device view on a page it refuses');
    assert.strictEqual(c.get('offline_boards'), null, 'larry\'s list is not left on sam\'s page');
  });

  test('when the open database stops being the signed-in person\'s, the list on screen goes', async function(assert) {
    var owner_now = 'larry';
    var c = page(this.owner);
    c.device_db_user = function() { return owner_now; };
    c.update_selected();
    await tick();
    assert.deepEqual(keys(c.get('offline_boards')), ['larry/home']);
    owner_now = null; // signed out, or another person signed in without a reload
    c.update_selected();
    await tick();
    assert.false(c.get('offline_view'));
    assert.strictEqual(c.get('offline_boards'), null);
  });
});
