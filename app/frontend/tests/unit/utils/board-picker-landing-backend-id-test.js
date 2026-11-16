import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { mark_basic_try, basic_try_target } from 'frontend/utils/board_picker_landing';

/* WHOSE TRY IS ON SCREEN, BY PERSON (section 24 of docs/task-management/2026-11-10_offline-followup-proposals.md).
 * The session user can be held by a record keyed 'self' (a network load, real id in global_id) and one keyed by the
 * real id. The try marker stores the BACKEND id, and reads compare people (utils/backend_user_id.js same_person), so
 * a try for yourself never reads as a try for someone else. */
module('Unit | Utility | board_picker_landing backend ids', function() {
  function appState(props) {
    var state = { set(k, v) { this[k] = v; }, get(k) { var root = this; return k.split('.').reduce(function(o, p) { return o && (o !== root && o.get ? o.get(p) : o[p]); }, this); } };
    Object.assign(state, props);
    return state;
  }
  var me_net = EmberObject.create({ id: 'self', global_id: '1_3', user_name: 'example' });
  var me_local = EmberObject.create({ id: '1_3', global_id: '1_3', user_name: 'example' });
  var other = EmberObject.create({ id: '1_7', global_id: '1_7', user_name: 'aiden_parker' });

  test('a try for the record keyed self stores the real id, never self', function(assert) {
    var state = appState({});
    mark_basic_try(state, 'example/core-60', me_net, 'Core 60');
    assert.strictEqual(state.basic_try_home.user_id, '1_3');
  });

  test('a try marked by the real id reads as your own while currentUser is the record keyed self', function(assert) {
    var state = appState({ currentUser: me_net, sessionUser: me_net, currentBoardState: { key: 'example/core-60' } });
    state.basic_try_home = { key: 'example/core-60', user_id: '1_3', user_name: 'example' };
    assert.strictEqual(basic_try_target(state), 'self');
  });

  test('an older marker holding self reads as your own while currentUser is the real-id record', function(assert) {
    var state = appState({ currentUser: me_local, sessionUser: me_net, currentBoardState: { key: 'example/core-60' } });
    state.basic_try_home = { key: 'example/core-60', user_id: 'self', user_name: 'example' };
    assert.strictEqual(basic_try_target(state), 'self');
  });

  test('a try for a genuinely different person is still for someone else', function(assert) {
    var state = appState({ currentUser: me_net, sessionUser: me_net, currentBoardState: { key: 'example/core-60' } });
    mark_basic_try(state, 'example/core-60', other, 'Core 60');
    assert.strictEqual(state.basic_try_home.user_id, '1_7');
    assert.strictEqual(basic_try_target(state), 'other');
  });
});
