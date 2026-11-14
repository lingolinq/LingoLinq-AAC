import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { setupTest } from '../../helpers';
import { stub, restoreStubs } from 'frontend/tests/helpers/jasmine';
import LingoLinq from 'frontend/app';

/* PICKING OR SETTING UP FOR YOURSELF (section 24 of docs/task-management/2026-11-10_offline-followup-proposals.md).
 * `setup_user` and currentUser can be the records keyed 'self' and by the real id of one person; the board picker's
 * and setup's `for_self`, and the application's `setup_for_other`, compare people by backend id
 * (utils/backend_user_id.js same_person), so the person themself never gets the "for someone else" flow. */
module('Unit | Controller | for_self across the two session records', function(hooks) {
  setupTest(hooks);
  hooks.afterEach(function() { restoreStubs(); });

  function state(context, me) {
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({ currentUser: me, sessionUser: me }));
  }
  var me_net = function() { return EmberObject.create({ id: 'self', global_id: '1_3', user_name: 'example' }); };
  var me_local = function() { return EmberObject.create({ id: '1_3', global_id: '1_3', user_name: 'example' }); };
  var other = function() { return EmberObject.create({ id: '1_7', global_id: '1_7', user_name: 'aiden_parker' }); };

  test('board-picker: the real-id record is yourself while currentUser is keyed self', function(assert) {
    state(this, me_net());
    assert.true(this.owner.factoryFor('controller:board-picker').create({ setup_user: me_local() }).get('for_self'));
  });

  test('board-picker: a genuinely different person is not yourself', function(assert) {
    state(this, me_net());
    assert.false(this.owner.factoryFor('controller:board-picker').create({ setup_user: other() }).get('for_self'));
  });

  test('setup: the record keyed self is yourself while currentUser is the real-id record', function(assert) {
    state(this, me_local());
    assert.true(this.owner.factoryFor('controller:setup').create({ setup_user: me_net() }).get('for_self'));
  });

  test('setup: a genuinely different person is not yourself', function(assert) {
    state(this, me_net());
    assert.false(!!this.owner.factoryFor('controller:setup').create({ setup_user: other() }).get('for_self'));
  });

  test('application: setting up your own real id while currentUser is keyed self is not for someone else', function(assert) {
    var peeked = [];
    stub(LingoLinq, 'store', { peekRecord: function(type, id) { peeked.push(id); return other(); } });
    state(this, me_net());
    var c = this.owner.factoryFor('controller:application').create({ setup_user_id: '1_3' });
    assert.strictEqual(c.get('setup_for_other'), null);
    assert.deepEqual(peeked, []);
  });

  test('application: setting up a genuinely different person is for someone else', function(assert) {
    var them = other();
    stub(LingoLinq, 'store', { peekRecord: function(type, id) { return id === '1_7' ? them : null; } });
    state(this, me_net());
    var c = this.owner.factoryFor('controller:application').create({ setup_user_id: '1_7' });
    assert.strictEqual(c.get('setup_for_other'), them);
  });
});
