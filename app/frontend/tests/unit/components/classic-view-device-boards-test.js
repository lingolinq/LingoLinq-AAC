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
});
