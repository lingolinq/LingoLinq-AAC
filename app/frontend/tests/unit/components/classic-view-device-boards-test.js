import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import RSVP from 'rsvp';
import { setupTest } from '../../helpers';

/* Basic's home page Boards tab while offline: "Boards on This Device" (Traci, 2026-11-16;
 * components/dashboard/classic-view.js load_device_boards; docs/task-management/2026-11-16_offline-boards-page.md).
 * It used to list only the recently opened boards (up to 12) that were on the device. Its list is its own
 * (`deviceBoards`), so the online Recent tab (`recentOfflineBoards`) is unchanged. */
module('Unit | Component | classic-view boards on this device', function(hooks) {
  setupTest(hooks);

  function setup(context, opts) {
    opts = opts || {};
    var user = EmberObject.create({ user_name: 'larry', preferences: { home_board: { id: '1_1', key: 'larry/home' } }, stats: {} });
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({ currentUser: user }));
    context.owner.unregister('service:persistence');
    context.owner.register('service:persistence', Service.extend({ online: !!opts.online, sync_log: [], find_recent: function() { return RSVP.resolve([]); } }));
    var component = context.owner.factoryFor('component:dashboard/classic-view').create({ model: EmberObject.create({ id: '9', load_word_activities: function() {} }) });
    component.reads = 0;
    component.device_db_user = function() { return opts.db_user === undefined ? 'larry' : opts.db_user; };
    component.set('device_storage', { find_all: function() {
      component.reads++;
      return RSVP.resolve([{ data: { id: '1_1', raw: { id: '1_1', key: 'larry/home', name: 'Home', user_name: 'larry' } } }]);
    } });
    return component;
  }
  var tick = function() { return new Promise((r) => setTimeout(r, 30)); };

  test('offline: the boards on the device, in its own list (the Recent tab\'s list is untouched)', async function(assert) {
    var c = setup(this);
    c.set('recentOfflineBoards', ['recent marker']);
    c.load_device_boards();
    await tick();
    assert.deepEqual(c.get('deviceBoards').map((b) => b.get('key')), ['larry/home']);
    assert.deepEqual(c.get('recentOfflineBoards'), ['recent marker']);
  });

  test('online: nothing is read', async function(assert) {
    var c = setup(this, { online: true });
    c.load_device_boards();
    await tick();
    assert.strictEqual(c.reads, 0);
    assert.notOk(c.get('deviceBoards'));
  });

  test('another person\'s (or an unknown) device database: nothing is read', async function(assert) {
    var c = setup(this, { db_user: null });
    c.load_device_boards();
    await tick();
    assert.strictEqual(c.reads, 0);
    assert.notOk(c.get('deviceBoards'));
  });

  test('read once while offline (the device\'s boards cannot change without a sync)', async function(assert) {
    var c = setup(this);
    c.load_device_boards();
    await tick();
    c.load_device_boards();
    await tick();
    assert.strictEqual(c.reads, 1);
  });

  // Part 3 (docs/task-management/2026-11-16_offline-boards-page.md).
  var home_row = function() { return { data: { id: '1_1', raw: { id: '1_1', key: 'larry/home', name: 'Home', user_name: 'larry' } } }; };
  // Each device read waits until the test releases it: release.fn is the latest read, release.all every read in order.
  var held = function(c) {
    var release = { fn: null, all: [] };
    c.set('device_storage', { find_all: function() { c.reads++; return new RSVP.Promise((r) => { release.fn = r; release.all.push(r); }); } });
    return release;
  };

  test('a new offline spell reads again; the earlier list stays on screen meanwhile (also while online)', async function(assert) {
    var c = setup(this);
    c.load_device_boards();
    await tick();
    var first = c.get('deviceBoards');
    var release = held(c);
    c.set('persistence.online', true);
    await tick();
    assert.strictEqual(c.get('deviceBoards'), first, 'online: not cleared (the offline branch can still be on screen)');
    c.set('persistence.online', false);
    await tick();
    assert.strictEqual(c.reads, 2, 'read again in the new offline spell');
    assert.strictEqual(c.get('deviceBoards'), first, 'the earlier list stays during the read');
    release.fn([home_row(), { data: { id: '1_2', raw: { id: '1_2', key: 'larry/new', name: 'New', user_name: 'larry' } } }]);
    await tick();
    assert.deepEqual(c.get('deviceBoards').map((b) => b.get('key')), ['larry/home', 'larry/new']);
  });

  test('the current user record replaced by another of the same person: the read still lands (no endless "Finding...")', async function(assert) {
    var c = setup(this);
    var release = held(c);
    c.load_device_boards();
    await tick();
    c.set('appState.currentUser', EmberObject.create({ user_name: 'larry', preferences: { home_board: { id: '1_1', key: 'larry/home' } }, stats: {} }));
    await tick();
    release.all[0]([home_row()]); // the read started with the record that was replaced
    await tick();
    assert.notOk(c.get('deviceBoards.loading'));
    assert.deepEqual(c.get('deviceBoards').map((b) => b.get('key')), ['larry/home']);
  });

  test('a user name that arrives later starts the read', async function(assert) {
    var c = setup(this);
    c.set('appState.currentUser', EmberObject.create({ preferences: {}, stats: {} }));
    c.load_device_boards();
    await tick();
    assert.strictEqual(c.reads, 0);
    c.set('appState.currentUser.user_name', 'larry');
    await tick();
    assert.strictEqual(c.reads, 1);
  });

  test('a device database that is not this person\'s: no list (an earlier one is dropped), and the page says it cannot show them', async function(assert) {
    var c = setup(this, { db_user: 'sam' });
    var earlier = [];
    earlier.from_device = true;
    earlier.user_name = 'sam';
    c.set('deviceBoards', earlier);
    c.load_device_boards();
    await tick();
    assert.strictEqual(c.reads, 0);
    assert.notOk(c.get('deviceBoards'));
    assert.true(c.get('deviceBoardsRefused'));
  });

  test('a shared device, or one whose trust is not known yet: another owner\'s board is not listed; trusted, it is', async function(assert) {
    var c = setup(this);
    c.set('appState.currentUser.stats', { starred_board_refs: [{ id: '4_1', key: 'therapist/feelings' }] });
    c.set('persistence.sync_log', [{ user_id: 'larry', statuses: [{ id: '4_1', key: 'therapist/feelings', status: 'cached' }] }]);
    c.set('device_storage', { find_all: function() { c.reads++; return RSVP.resolve([home_row(), { data: { id: '4_1', raw: { id: '4_1', key: 'therapist/feelings', name: 'Feelings', user_name: 'therapist' } } }]); } });
    c.load_device_boards();
    await tick();
    assert.deepEqual(c.get('deviceBoards').map((b) => b.get('key')), ['larry/home'], 'unknown trust counts as shared');
    c.set('appState.sessionUser', EmberObject.create({ preferences: { device: { long_token: true } } }));
    c.load_device_boards();
    await tick();
    assert.deepEqual(c.get('deviceBoards').map((b) => b.get('key')), ['larry/home', 'therapist/feelings'], 'trusted: read again');
  });

  test('a first read that fails is shown as failed and read again next time', async function(assert) {
    var c = setup(this);
    c.set('device_storage', { find_all: function() { c.reads++; if(c.reads === 1) { throw new Error('The database connection is closing.'); } return RSVP.resolve([home_row()]); } });
    c.load_device_boards();
    await tick();
    assert.true(c.get('deviceBoards.read_failed'));
    c.load_device_boards();
    await tick();
    assert.strictEqual(c.reads, 2, 'read again');
    assert.deepEqual(c.get('deviceBoards').map((b) => b.get('key')), ['larry/home']);
  });

  // docs/task-management/2026-11-23-offline-liked-board-verdicts.md: the verdicts kept beyond the 5-entry sync log reach
  // Basic's list too, so a liked board whose seeing sync has left the log is still listed.
  test('a liked board seen by a sync that has left the log is listed from the kept verdicts', async function(assert) {
    var c = setup(this);
    c.set('appState.sessionUser', EmberObject.create({ preferences: { device: { long_token: true } } }));
    c.set('appState.currentUser.stats', { starred_board_refs: [{ key: 'therapist/feelings' }] });
    c.set('persistence.sync_log', []);
    c.set('persistence.board_verdicts', { larry: { top: 5, t: { 'therapist/feelings': { v: true, n: 5 } } } });
    c.set('device_storage', { find_all: function() { c.reads++; return RSVP.resolve([home_row(), { data: { id: '4_1', raw: { id: '4_1', key: 'therapist/feelings', name: 'Feelings', user_name: 'therapist' } } }]); } });
    c.load_device_boards();
    await tick();
    assert.deepEqual(c.get('deviceBoards').map((b) => b.get('key')), ['larry/home', 'therapist/feelings']);
  });

  // Review of the built code (senior pass, H1): the kept verdicts are read when the device read finishes, so a restore
  // that lands while the read runs (an offline cold start) still reaches the list.
  test('kept verdicts that arrive while the device read runs still reach the list', async function(assert) {
    var c = setup(this);
    var release = null;
    c.set('appState.sessionUser', EmberObject.create({ preferences: { device: { long_token: true } } }));
    c.set('appState.currentUser.stats', { starred_board_refs: [{ key: 'therapist/feelings' }] });
    c.set('persistence.sync_log', []);
    c.set('device_storage', { find_all: function() { return new RSVP.Promise(function(r) { release = r; }); } });
    c.load_device_boards();
    await tick();
    c.set('persistence.board_verdicts', { larry: { top: 5, t: { 'therapist/feelings': { v: true, n: 5 } } } });
    release([home_row(), { data: { id: '4_1', raw: { id: '4_1', key: 'therapist/feelings', name: 'Feelings', user_name: 'therapist' } } }]);
    await tick();
    assert.deepEqual(c.get('deviceBoards').map((b) => b.get('key')), ['larry/home', 'therapist/feelings']);
  });
});
