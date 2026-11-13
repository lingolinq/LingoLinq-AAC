import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import backend_user_id, { same_person } from 'frontend/utils/backend_user_id';

/* ONE PERSON, TWO RECORDS (section 21 of docs/task-management/2026-11-10_offline-followup-proposals.md). A network load
 * of the session user is keyed 'self' (serializers/application.js), a local or by-id load is keyed by the real id, and
 * ids from the server are always real. People are compared by backend id; the id string 'self' stands for the session
 * user. Stubs use the network-load shape { id: 'self', global_id }. */
module('Unit | Utility | backend_user_id', function() {
  var me_net = EmberObject.create({ id: 'self', global_id: '1_3' });
  var me_local = EmberObject.create({ id: '1_3', global_id: '1_3' });
  var other = EmberObject.create({ id: '1_9', global_id: '1_9' });

  test('the backend id of either record of the session user is the real id', function(assert) {
    assert.strictEqual(backend_user_id(me_net), '1_3');
    assert.strictEqual(backend_user_id(me_local), '1_3');
    assert.strictEqual(backend_user_id(null), null);
  });

  test('two records of the same person are the same person', function(assert) {
    assert.true(same_person(me_net, me_local));
    assert.true(same_person(me_local, me_net));
  });

  test('a real id string and the record keyed self are the same person', function(assert) {
    assert.true(same_person('1_3', me_net));
    assert.true(same_person(me_net, '1_3'));
  });

  test('the id self means the session user', function(assert) {
    assert.true(same_person('self', '1_3', me_net), 'self against the real id');
    assert.true(same_person('self', me_local, me_net), 'self against the local record');
    assert.false(same_person('self', '1_9', me_net), 'self against someone else');
  });

  test('different people are never the same, and nobody is nobody', function(assert) {
    assert.false(same_person(me_net, other));
    assert.false(same_person('1_3', '1_9'));
    assert.false(same_person(null, me_net));
    assert.false(same_person(null, null));
    assert.false(same_person('self', '1_3', null), 'self with no session user is unknown');
  });
});
