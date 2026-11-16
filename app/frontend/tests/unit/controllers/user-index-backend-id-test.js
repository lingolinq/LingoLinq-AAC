import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { waitUntil } from '@ember/test-helpers';
import { setupTest } from '../../helpers';
import { stub, restoreStubs } from 'frontend/tests/helpers/jasmine';
import modal from 'frontend/utils/modal';
import boardsPageListCache from 'frontend/utils/boards_page_list_cache';

/* THE BOARDS / ACCOUNT PAGE FOR THE PERSON THEMSELF (section 24 of
 * docs/task-management/2026-11-10_offline-followup-proposals.md). The page's model and the session user can be the
 * records keyed 'self' (a network load, real id in global_id) and by the real id of one person. The page compares
 * people by backend id (utils/backend_user_id.js) and keys the Mine-list snapshot by the backend id. */
module('Unit | Controller | user/index backend ids', function(hooks) {
  setupTest(hooks);
  hooks.afterEach(function() { restoreStubs(); });

  function controller(context, me, page, extra) {
    var calls = { transitions: [], ajax: [] };
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend(Object.assign({ currentUser: me, sessionUser: me }, (extra && extra.state) || {})));
    context.owner.unregister('service:router');
    context.owner.register('service:router', Service.extend({
      transitionTo: function() { calls.transitions.push(Array.prototype.slice.call(arguments)); }
    }));
    context.owner.unregister('service:persistence');
    context.owner.register('service:persistence', Service.extend({
      // Never settles: the test reads only whether the request was made.
      ajax: function(url) { calls.ajax.push(url); return new Promise(function() {}); }
    }));
    // Created with its model (not `set` afterwards), so the model observers do not fire on their own.
    var c = context.owner.factoryFor('controller:user/index').create({ model: page });
    return { c: c, calls: calls };
  }
  var me_net = function() { return EmberObject.create({ id: 'self', global_id: '1_3', user_name: 'example', permissions: {} }); };
  var me_local = function() { return EmberObject.create({ id: '1_3', global_id: '1_3', user_name: 'example', permissions: {} }); };
  var other = function() { return EmberObject.create({ id: '1_7', global_id: '1_7', user_name: 'aiden_parker', permissions: {} }); };

  test('homeBoardPickerUserId: your own page is the self flow across the two records', function(assert) {
    assert.strictEqual(controller(this, me_net(), me_local()).c.get('homeBoardPickerUserId'), null, 'real-id page, self-keyed currentUser');
    assert.strictEqual(controller(this, me_local(), me_net()).c.get('homeBoardPickerUserId'), null, 'self-keyed page, real-id currentUser');
  });

  test('homeBoardPickerUserId: a genuinely different person gets their backend id', function(assert) {
    assert.strictEqual(controller(this, me_net(), other()).c.get('homeBoardPickerUserId'), '1_7');
  });

  test('toggleSetHomeMode: your own page opens the self picker; someone else\'s passes their backend id', function(assert) {
    var mine = controller(this, me_local(), me_net());
    mine.c.send('toggleSetHomeMode');
    assert.deepEqual(mine.calls.transitions, [['board-picker']], 'self flow, no user_id');
    var theirs = controller(this, me_net(), other());
    theirs.c.send('toggleSetHomeMode');
    assert.deepEqual(theirs.calls.transitions, [['board-picker', { queryParams: { user_id: '1_7' } }]]);
  });

  test('daily use loads on your own page when the session record is keyed self', function(assert) {
    stub(boardsPageListCache, 'isBoardsPageActive', function() { return false; });
    var me = me_net();
    var r = controller(this, me, me_local(), { state: { sessionUser: me } });
    r.c.check_daily_use();
    assert.deepEqual(r.calls.ajax, ['/api/v1/users/example/daily_use']);
  });

  test('daily use stays off on a genuinely different person\'s page without admin support', function(assert) {
    stub(boardsPageListCache, 'isBoardsPageActive', function() { return false; });
    var r = controller(this, me_net(), other());
    r.c.check_daily_use();
    assert.deepEqual(r.calls.ajax, []);
    assert.strictEqual(r.c.get('daily_use'), null);
  });

  test('removing a board clears the Mine-list snapshot under the backend id, not self', async function(assert) {
    var cleared = [];
    stub(modal, 'open', function() { return Promise.resolve({ update: true }); });
    stub(boardsPageListCache, 'clear', function(id) { cleared.push(id); });
    var r = controller(this, me_net(), me_net());
    stub(r.c, 'update_selected', function() {});
    r.c.send('remove_board', 'delete', EmberObject.create({ id: '1_60' }));
    await waitUntil(function() { return cleared.length > 0; });
    assert.deepEqual(cleared, ['1_3']);
  });
});
